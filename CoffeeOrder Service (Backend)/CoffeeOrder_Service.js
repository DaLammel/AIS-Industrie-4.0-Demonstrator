#!/usr/bin/env node		// should make this directly executable on RPi without needing to type "node" before the filename

// CoffeeOrder Service by Jakob Lammel
// Based on https://github.com/node-opcua/node-opcua/blob/master/documentation/server_with_method.js
// Security Features based on https://github.com/node-opcua/node-opcua/blob/master/packages/node-opcua-samples/bin/simple_secure_server.js
// See more examples for how to implement node-opcua applications in the npm package 'node-opcua-samples' ($ npm install node-opcua-samples)
// Node-opcua API documentation can be found here: http://node-opcua.github.io/api_doc/0.2.0/
// CODESYS OPC UA Server security integration was developed according to CODESYS OPC UA Documentation at https://help.codesys.com/webapp/_cds_runtime_opc_ua_server;product=codesys;version=3.5.13.0#benutzerverwaltung-unter-opc-ua  (accessed on 18.08.2018)

/*CoffeeOrder Service is supposed to be an OPC UA Server that serves as a backend for the AIS Industrie 4.0 Demostrator.
Frontend Applications (e.g. the AIS_Demonstrator Android App by Florian Hänel) can establish a connection to the Service via the OPC UA endpoint URL.
The CoffeeOrder Service offers the following Services:
* ToDo

*/


// Required npm packages
var opcua = require("node-opcua");		// required to provide OPC UA functionalities.
var async = require("async");			// required for some async functionality. (Async functionalities should be part of Node.js as of Node 7.6 by default but oh well...)
var path = require("path");				// required for certificate management & finding path to certificate files
var _ = require("underscore");			// required for certificate management & finding path to certificate files
var readline = require('readline');	// used to listen to user commands during execution (e.g. "add" and "users")
var inquirer = require('inquirer');		// used by addUsers() to guide the amdin when adding new OPC UA Users

// flag used to determine whether or not adding new OPC UA Users during runtime is possible.
// if set to "true", commands "add" and "users" are available during runtime
const enableAddUser = true;

const SecurityPolicy = opcua.SecurityPolicy;
const MessageSecurityMode = opcua.MessageSecurityMode;
var get_fully_qualified_domain_name = opcua.get_fully_qualified_domain_name;
var makeApplicationUrn = opcua.makeApplicationUrn;

// used to create path of server certificate and server private key files
function constructFilename(filename) {
    return path.join(__dirname, filename);
}

// readline Interface, needed to parse user input and detect commands
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	prompt: '>> '
  });

// array of (default) users which can be used in the Android HMI-Application to gain access to the server
// can be extended dynamically using the "add" command if enableAddUsers = true; is set above
var users = [
	/*{
		Name: "Anna",
		Password: "123456"
	},
	{
		Name: "Test",
		Password: "Test1234!"
	}*/
];
// a simple user manager used for authentication by the OPC UA Server
var userManager = {
	isValidUser: function (userName, pw) {
		for (i = 0; i < users.length; i++) {
			if (users[i].Name == userName && users[i].Password == pw) {
				console.log("    --- User authentication was successful ---".yellow);
				console.log("   	Username: " + userName.magenta);
				return true;
			}
		}
		console.log("	--- User authentication failed! ---".red);
		console.log("   	Username: " + userName.magenta);
		return false;
    }
};

// Certificate files used for server security
var server_certificate_file = constructFilename("certificates/server_selfsigned_cert_2048.pem");
var server_certificate_privatekey_file = constructFilename("certificates/server_key_2048.pem");

// Server Instantiation
const options = {
	// Security Options
	securityPolicies: [
		SecurityPolicy.None,		// ToDo: debug only! comment out for release!
        SecurityPolicy.Basic256Sha256
    ],
    securityModes: [
		MessageSecurityMode.NONE,	// ToDo: debug only! comment out for release!
        MessageSecurityMode.SIGN,
        MessageSecurityMode.SIGNANDENCRYPT
    ],

	certificateFile: server_certificate_file,
	privateKeyFile: server_certificate_privatekey_file,
	// defaultSecureTokenLifetime: 6000,	// the default secure token life time in ms. default value is 60000 /* Breaks the server for some reason. Error "Could not connect to server: BadInvalidArgument" */
	userManager: userManager,				// use the userManager variable (with attached function to determine valid users) as the server user manager
	allowAnonymous: false,					// don't allow anonymous users (you can only create a session with a valid username + password combination. Every conbination listed in the users variable is considered valid)
	
	// securityPolicies: SecurityPolicy.Basic128Rsa15,	// securityPolicies= [SecurityPolicy.None, SecurityPolicy.Basic128Rsa15, SecurityPolicy.Basic256] // ToDo: Security Implementierung
	// securityModes= [MessageSecurityMode.NONE, MessageSecurityMode.SIGN, MessageSecurityMode.SIGNANDENCRYPT] // ToDo: Security Implementierung
	// allowAnonymous= true,	// Tells if the server default endpoints should allow anonymous connection. Default: true
	
	// Server Information
	serverInfo: {
        applicationUri: "CoffeeOrder_Service",
        productUri: "CoffeeOrder_Service",
        applicationName: {text: "CoffeeOrder_Service", locale: "de"},
        gatewayServerUri: null,
        discoveryProfileUri: null,
        discoveryUrls: []
    },
	// Network Options
    port: 34197, // the port of the listening socket of the server
	resourcePath: "CoffeeOrder", // this path will be added to the endpoint resource name
	
	buildInfo : {
        productName: "CoffeeOrder_Service_STUD",
        buildNumber: "1.0",
        buildDate: new Date(2018,4,24)
    }
};
var server = new opcua.OPCUAServer(options);

// Client Instantiation
// used for the OPC UA Client part of the CoffeeOrder_Service.
// This is NOT related to the Frontend (Android Application), instead this client is used to handle communication between the CoffeeOrder_Service and Codesys.
var client = new opcua.OPCUAClient();	// instantiate a new OPC UA Client
var client_session;	// 
// var client_subscription;	// the client subscription is used to get updates about variable changes from the CODESYS server
const CodesysEndpoint = "opc.tcp://192.168.0.101:4840"; // "opc.tcp://localhost:4840";	the Raspberry Pi can't seem to resolve 'localhost', therefore it's IP Address needed to be hard-coded as the endpoint URL
const NodeID_intCoffeeStrength = "ns=4;s=|var|CODESYS Control for Raspberry Pi SL.Application.Main.fbCMOperation.iButtonStatus[11]"; // NodeID of the variable for the current CoffeeStrength. Ranges from 0 ("Sehr Mild") to 4 ("Sehr Kräftig")
const NodeID_boolSmallCoffee = "ns=4;s=|var|CODESYS Control for Raspberry Pi SL.Application.Main.fbCMOperation.arrSwitch[2]";        // NodeID of the Switch to produce a small Coffee
const NodeID_boolMediumCoffee = "ns=4;s=|var|CODESYS Control for Raspberry Pi SL.Application.Main.fbCMOperation.arrSwitch[3]";       // NodeID of the Switch to produce a medium Coffee    
const NodeID_boolLargeCoffee = "ns=4;s=|var|CODESYS Control for Raspberry Pi SL.Application.Main.fbCMOperation.arrSwitch[4]";        // NodeID of the Switch to produce a large Coffee
const NodeID_boolCappuccino = "ns=4;s=|var|CODESYS Control for Raspberry Pi SL.Application.Main.fbCMOperation.arrSwitch[1]";         // NodeID of the Switch to produce a Cappuccino
const NodeID_boolCoffeeStrength = "ns=4;s=|var|CODESYS Control for Raspberry Pi SL.Application.Main.fbCMOperation.arrSwitch[11]";         // NodeID of the Switch to cycle through the Coffee Strength
const NodeID_intPackMLStatus = "ns=4;s=|var|CODESYS Control for Raspberry Pi SL.Application.Glob_Var.CM_PackML_Status";              // NodeID of the global Codesys Variable "CM_PackML_Status"
const NodeID_stringPackMLStatus = "ns=4;s=|var|CODESYS Control for Raspberry Pi SL.Application.Main.fbCMOperation.sPackMLStatus";    // NodeID of the PackML Status Variable as a String within FB_CoffeeMachineOperation
// About PackML Status:
/* PackML Status is a custom Enum Data Type created within the Codesys Program. The Enum type is called "PackML_Status".
Sadly OPC UA does not provide this custom Datatype, so it should be handled as an int in this program. */


// local representation of the current settings of the Coffee Machine (taken from Codesys)
var codesys_intPackMLStatus = 0;  // Global Variable where the subscription saves changed values of the PackML Status 
var codesys_stringPackMLStatus = "";  // Global Variable where the subscription saves changed values of the PackML Status 
var codesys_coffeeStrength; // Global Variable where the subscription saves changed values of the Coffee Strength
var codesys_serverStatus;


// declaration of internal Variables, used to handle the OPC UA Variables before writing them to a DB
var valueCoffeeLevel = 0;	//ToDo: initialize with 0, 100 is only for testing
var valueWaterLevel = 0;	//ToDo: initialize with 0, 100 is only for testing
var valueCleanlinessLevel = 0;	//ToDo: initialize with 0, 100 is only for testing
var valueCoffeeQuantity = 225;	//ToDo: initialize with 0, 225 is only for testing
var valueCoffeeStrength = 4;	//ToDo: initialize with 1, 4 is only for testing
var valueMilkQuantity = 25;	//ToDo: initialize with 0, 25 is only for testing
var cooldown = false;	// Helper varaible used to flag the toButton Method as "on cooldown", meant to be used with a timer which resets the flag after cooldownTime seconds
var cooldowntime = 60;	// Default value for the cooldown in seconds

// questions used by inquirer in addUsers() to add new OPC UA Users
var questions = [
	{
	  type: 'input',
	  name: 'username',
	  message: "Please enter a Username for the new user: ",
	  validate: function (value) {  // only accept non-existing and non-empty usernames
		for (var i = 0; i < users.length; i++) {
		  if (users[i].Name == value) {
			return "Username already exists! Please enter another Username";
		  }
		}
		if (value != "") {
		  return true;
		}
		return "Username can't be empty!";
	  }
	},
	{
	  type: 'password',
	  name: 'password',
	  message: "Please enter the password for the new user: ",
	  mask: '*',
	  validate: function (value) {  // only accept non-empty passwords
		if (value != "") {
		  return true;
		}
		return "The Password can't be empty!";
	  }
	}
  ];


// tied to command "help": display all available commands
function commandHelp() {
	console.log("--- Available commands: ---".green);
	console.log("--- (just start typing) ---");
	console.log("       \"help\":".green, " List all available commands (show this message again).");
	console.log("       	\"add\":".green, " Add a new user that can be used to access the OPC UA Server.");
	console.log("               	Note that users are not saved after shutdown!");
	console.log("      \"users\":".green, " Display all usernames that can currently be used.");
	console.log("  \"randomize\":".green, " Randomize the values of CoffeeLevel, WaterLevel and Cleanliness.\n               	Since the Coffee Machine can't provide the actual data,\n                this command can be used instead to demonstrate the\n                visualization of the machine data in the HMI Application");
	rl.prompt();
}
// tied to command "add": function to add another OPC UA User which can be used in the Android HMI-Application
function commandAddUser() {
	rl.pause();                 // pause readline stream (stop listening for commands so they aren't triggered accidentally)
	var newuser = null;
	inquirer.prompt(questions)  // ask the user about username/password
		.then(answers => {        // save the answers as a new user
			newuser = {
				Name: answers.username,
				Password: answers.password
			}
		})
		.then(() => {             // add the new user to the array of existing users
			users.push(newuser);    // this is the place where the new user could be saved to a database instead if this feature is added in the future
		})
		.then(function () {       // display success message
			console.log(new Date().toLocaleString('de-DE') + " Added new user: ".green, users[users.length - 1].Name);
			rl.resume();
		})
		.then(function () {       // re-activate the readline stream (resume listening for "add" and "users" commands)
			rl.prompt();
		});
};

// tied to command "users": function to print out all currently available users to the console
function commandLogAvailableUsers() {
	console.log(new Date().toLocaleString('de-DE') + " Logging available users: ".green);
	if (users.length == 0) {
		console.log("     No users available. Please type", "\"add\"".green, "to add a new user.")
	}
	for (var i = 0; i < users.length; i++) {
		console.log("     User ", i + 1, "'s Username: ", users[i].Name);
	}
	rl.prompt();
};

// tied to command "randomize": function to print out all currently available users to the console
function CommandRandomizeMachinedata() {
	valueCleanlinessLevel = Math.floor(Math.random() * Math.floor(100));
	valueCoffeeLevel = Math.floor(Math.random() * Math.floor(100));
	valueWaterLevel = Math.floor(Math.random() * Math.floor(100));
	console.log(new Date().toLocaleString('de-DE') + " Randomized Machine State data. New values are:".green);
	console.log("     \"Wasserstand\": ", valueWaterLevel, "/ 100");
	console.log("     \"Bohnenstand\": ", valueCoffeeLevel, "/ 100");
	console.log("       \"Reinigung\": ", valueCleanlinessLevel, "/ 100");
	rl.prompt();
};

// Function that establishes a Client connection with the Codesys Server
async function ClientConnection () {
    async.series([

        // step 1 : connect to the CODESYS OPC UA Server
        function connect(callback)  {
            client.connect(CodesysEndpoint,function (err) {
                if (err) {
                    console.log(new Date().toLocaleString('de-DE') + " Client: Cannot connect to Codesys endpoint URL: ".cyan, CodesysEndpoint);
                } else {
                    console.log(new Date().toLocaleString('de-DE') + " Client: Connected to CODESYS OPC UA Server at Endpoint URL: ".cyan, CodesysEndpoint);
                }
                callback(err);
            });
        },
    
        // step 2 : create a new session 
        function createsession(callback) {
			// see for User Authentication documentation: http://node-opcua.github.io/api_doc/0.2.0/classes/OPCUAClient.html#method_connect
			const userIdentityInfo  = { userName: "CoffeeOrder_Service", password:"1337BackEnd!"};
            client.createSession(userIdentityInfo, function(err,session) { // creates a new Session with the "Back-End" Role which has been configured in OPC UA
                if(!err) {
                    client_session = session;
                    console.log(new Date().toLocaleString('de-DE') + " Client: Session created!".cyan);
                }
                else {
                    console.log(new Date().toLocaleString('de-DE') + " Client: Error! Session could not be created! (CODESYS Server)".red);
                }
                callback(err);
            });
        },
        
        // step 3: install a subscription and add monitored items
        function (callback) {

            subscription_Codesys = new opcua.ClientSubscription(client_session, {
                requestedPublishingInterval: 100,   // Publish information about monitored items every 100 ms (from Codesys to Backend)
                requestedLifetimeCount: 20,  // Counter
                requestedMaxKeepAliveCount: 2,   // Counter
                maxNotificationsPerPublish: 1,  // Counter
                publishingEnabled: true,
                priority: 10 // Byte
            });

            subscription_Codesys.on("started", function () {	// ToDo: delete, only for debugging purposes
                // console.log(new Date().toLocaleString('de-DE') + " Client: subscription started for 30 seconds - subscriptionId=", subscription_Codesys.subscriptionId);
            }).on("keepalive", function () {
                console.log(new Date().toLocaleString('de-DE') + " Client: Subscription Keelapive - PackML state is: ".cyan, dataValue.value.value);
            }).on("terminated", function () {
                console.log(new Date().toLocaleString('de-DE') + " Client: Codesys subscription terminated! Orders can no longer be placed.".red);
            });

            /* setTimeout(function () {
                subscription_Codesys.terminate(callback);
            }, 15000); */    // ToDo Delete: Terminate subscription after this time (in ms)

            // install monitored items
            var monitoredItem_intPackMLStatus = subscription_Codesys.monitor({ // monitoring mode is automatically set to "reporting"
                nodeId: NodeID_intPackMLStatus,
                attributeId: opcua.AttributeIds.Value
            },
                {
                    samplingInterval: 100, // Check PackMLSTatus Value every 100ms (Only handles how often CODESYS checks the value internally, see requestedPublishingInterval to adjust "how often backend receives updated values")
                    discardOldest: true, // if true: only keeps the most recent value. We don't need to know the history of the PackMLStatus, therefore this should be true.
                    filter: null,    // Not needed; Filters can be used to only show value changes greater than a set tolerance
                    queueSize: 1 // We don't need to know the history of the PackMLStatus, therefore only the newest value is needed in the queue
                },
			);
			var monitoredItem_stringPackMLStatus = subscription_Codesys.monitor({ // monitoring mode is automatically set to "reporting"
                nodeId: NodeID_stringPackMLStatus,
                attributeId: opcua.AttributeIds.Value
            },
                {
                    samplingInterval: 100, // Check PackMLSTatus Value every 100ms (Only handles how often CODESYS checks the value internally, see requestedPublishingInterval to adjust "how often backend receives updated values")
                    discardOldest: true, // if true: only keeps the most recent value. We don't need to know the history of the PackMLStatus, therefore this should be true.
                    filter: null,    // Not needed; Filters can be used to only show value changes greater than a set tolerance
                    queueSize: 1 // We don't need to know the history of the PackMLStatus, therefore only the newest value is needed in the queue
                },
			);
			var monitoredItem_ServerStatus = subscription_Codesys.monitor({ // monitoring mode is automatically set to "reporting"
                nodeId: "ns=0;i=2259",   // this nodeID is specified as the server status nodeID in OPC UA specs, part 4, 6.7 
                attributeId: opcua.AttributeIds.Value
            },
                {
                    samplingInterval: 100, // Check PackMLSTatus Value every 100ms (Only handles how often CODESYS checks the value internally, see requestedPublishingInterval to adjust "how often backend receives updated values")
                    discardOldest: true, // if true: only keeps the most recent value. We don't need to know the history of the PackMLStatus, therefore this should be true.
                    filter: null,    // Not needed; Filters can be used to only show value changes greater than a set tolerance
                    queueSize: 1 // We don't need to know the history of the PackMLStatus, therefore only the newest value is needed in the queue
                },
            );
            var monitoredItem_CoffeeStrength = subscription_Codesys.monitor({ // monitoring mode is automatically set to "reporting"
                nodeId: NodeID_intCoffeeStrength,
                attributeId: opcua.AttributeIds.Value
            },
                {
                    samplingInterval: 100, // Check CoffeeStrength Value every 100ms (Only handles how often CODESYS checks the value internally, see requestedPublishingInterval to adjust "how often backend receives updated values")
                    discardOldest: true, // if true: only keeps the most recent value. We don't need to know the history of the CoffeeStrength, therefore this should be true.
                    filter: null,    // Not needed; Filters can be used to only show value changes greater than a set tolerance.
                    queueSize: 1 // We don't need to know the history of the CoffeeStrength, therefore only the newest value is needed in the queue.
                },
                opcua.read_service.TimestampsToReturn.Neither    // Timestamps are not needed for the Coffee machine
            );

            monitoredItem_intPackMLStatus.on("changed", function (dataValue) {
                // update internal variable whenever the value of the monitored item changes
                codesys_intPackMLStatus = dataValue.value.value;
                //	console.log(new Date().toLocaleString('de-DE') + " Client Subscription: PackML intStatus ist jetzt: ", codesys_intPackMLStatus);	// only for debug
			});
			monitoredItem_stringPackMLStatus.on("changed", function (dataValue) {
                // update internal variable whenever the value of the monitored item changes
                codesys_stringPackMLStatus = dataValue.value.value;
                console.log(new Date().toLocaleString('de-DE') + " Client Subscription: PackML state is now: ".cyan, codesys_stringPackMLStatus);
            });
            monitoredItem_CoffeeStrength.on("changed", function (dataValue) {
                // update internal variable whenever the value of the monitored item changes
                codesys_coffeeStrength = 1 + dataValue.value.value;	// here we compensate for the fact that the coffeestrength in codesys ranges from 0 to 4 while in the frontend it ranges from 1 to 5
                console.log(new Date().toLocaleString('de-DE') + " Client Subscription: CoffeeStrength is now: ".cyan, codesys_coffeeStrength);
            });
            monitoredItem_ServerStatus.on("changed", function (dataValue) {
                // update internal variable whenever the value of the monitored item changes
                codesys_serverStatus = dataValue.value.value;
                if (codesys_serverStatus != 0) {
                    console.log(new Date().toLocaleString('de-DE') + " WARNING: CODESYS Server state is no longer 'running'! ".red);
                }
            });
        }
    ],
    function(err) {
        if (err) {
            console.log(new Date().toLocaleString('de-DE') + " Client: Async series failure: ".red, err);
		} /* else {
			console.log(new Date().toLocaleString('de-DE') + " Debug: Async series completed!");		// only for debug
		} */
    }) ;
}
// Function that Closes the Client Connection
function ClientDisconnect () {
    client_session.close(function(err){
        if(err) {
            console.log(new Date().toLocaleString('de-DE') + " Client: Session.close failed!".red);
        }
        else {
            console.log(new Date().toLocaleString('de-DE') + " Client: Session closed.".cyan);
        }
    });
    client.disconnect(function(err){
        if(err) {
            console.log(new Date().toLocaleString('de-DE') + " Client: Client.disconnect failed!".red);
        }
        else {
            console.log(new Date().toLocaleString('de-DE') + " Client: Disconnected!".cyan);
        }
    })
}

function resetCooldown(){	// resets the cooldown when called. Should be called with: setTimeout(() => resetCooldown(), (cooldowntime*1000));
	cooldown = false;
}

// The function pressButton is used within the toButton Method to "Press the Buttons" in Codesys. It takes the NodeID (in the Codesys OCP UA Namespace) of the button that is to be pressed .
function pressButton(buttonToPressNodeID) {	// debug: used to be called with callback as argument
    var nodeToWrite = {		// this is the object which represents the write data. It consists of the actual value and some extra contextual data that is needed by the Codesys OPC UA Server.
        nodeId: buttonToPressNodeID,
        attributeId: opcua.AttributeIds.Value,
        value: {
            statusCode: opcua.StatusCodes.Good,
            value: {
                dataType: opcua.DataType.Boolean,
                value: true	// this is the actual data value that is written to Codesys
            }
        }
    }
    client_session.write(nodeToWrite, function (err, statusCode) {
        if (err) {
            console.log(new Date().toLocaleString('de-DE') + " Client: Write Error: ".red, err);
        }
        // console.log(new Date().toLocaleString('de-DE') + " Client: Write Response Status Code: ".cyan, statusCode.name);	// only for debug
        if (statusCode == opcua.StatusCodes.Good) { // "if the button was pressed successfully"
            nodeToWrite.value.value.value = false;    // We need to set the Button Status to false in order to "un-press" the button. This is done 500ms after the first write has returned a 'Good' Status Code
            setTimeout(() => client_session.write(nodeToWrite, function (err, statusCode2) {
                if (err) {
                    console.log(new Date().toLocaleString('de-DE') + " Client: Write Reset Error (the button could not be \"un-pressed\": ".red, err);
                }
                // console.log(new Date().toLocaleString('de-DE') + " Client Debug: Write Reset Response Status Code: ", statusCode2.name);	// only for debug
            }), 500);   // Timer for the Reset, should be ~ 500 [ms]
            // console.log(new Date().toLocaleString('de-DE') + " Client Debug: Write Status Code Good");	// only for debug
        }
        else {
            console.log(new Date().toLocaleString('de-DE') + " Client: Bad Write Status Code: ".red, statusCode.name);
		}
    });
}

// The function setCoffeeStrength is used within the toButton Method to adjust the Coffee Strength setting of the Coffee Machine.
async function setCoffeeStrength(callback) {
	var difference = valueCoffeeStrength - codesys_coffeeStrength;
	if (difference != 0) {
		if (codesys_coffeeStrength > valueCoffeeStrength) {	// correction in case the current coffee strength is higher than the desired coffee strength 
			difference += 5;
		}
		// console.log(new Date().toLocaleString('de-DE') + " Debug: Desired Coffeestrength: ", valueCoffeeStrength);
		// console.log(new Date().toLocaleString('de-DE') + " Debug: Current Coffeestrength: ", codesys_coffeeStrength);
		// console.log(new Date().toLocaleString('de-DE') + " Debug: Button will be pressed ", difference, " times.");
		async.whilst(	// documentation of async.whilst:	https://caolan.github.io/async/docs.html#whilst
			function () { return difference > 0 },	    // test: this is the test for the whilst function: call the next function as long as "difference is not null"
			function (cb) {                             // iteratee:
				pressButton(NodeID_boolCoffeeStrength);
				difference--;
				setTimeout(function () {
					cb(null, null);
				}, 1500);
			},
			function (err) {
				callback(err);                          // callback: "global" callback (callback of setCoffeeStrength) is only called once the test does not pass anymore, i.e. once difference = 0 (which means the coffeestrength has been set to the correct value)
			}
		);
	}
	else {
		callback();
	}
}

// The function pressButton is used within the toButton Method to trigger the production of Coffee
async function makeCoffee(callMethodResult, callback) {	// Debug: used to be called with callback as second parameter 
	async.series([
		//
		//	*************************************
		//	*		Wrapper Function Logic:		*
		//	*	Decide which coffee to produce	*
		//	*									*
		//	*************************************
		//	Concept:
		//
		//	Cappuccino: more or equal Milk than Coffee
		//	Large: valueCoffeeQuantity more than 200
		//	Medium: valueCoffeeQuantity less than 200 but more than 100
		//	Small: valueCoffeeQuantity less than 100
		//
		function (callback2) {
			if (valueMilkQuantity >= valueCoffeeQuantity) {
				// make Cappuccino
				// console.log(new Date().toLocaleString('de-DE') + " Make cappuccino");	// only for debug
				callMethodResult.statusCode = opcua.StatusCodes.Good;
				callMethodResult.outputArguments[0].value = "Bestellung ausgelöst: Ein Cappuccino wird für Sie zubereitet.";
				pressButton(NodeID_boolCappuccino);
				callback();
				console.log(new Date().toLocaleString('de-DE') + " Order completed: A \'Cappuccino\' (CoffeeStrength: ", codesys_coffeeStrength, ") has been ordered.".green);
			}
			else {
				if (valueCoffeeQuantity >= 120) {
					// make large Coffee
					// console.log(new Date().toLocaleString('de-DE') + " DEBUG: make large coffee");	// only for debug
					callMethodResult.statusCode = opcua.StatusCodes.Good;
					callMethodResult.outputArguments[0].value = "Bestellung ausgelöst: Ein großer Kaffee wird für Sie zubereitet.";
					pressButton(NodeID_boolLargeCoffee);
					callback();
					console.log(new Date().toLocaleString('de-DE') + " Order completed: A \'Large Coffee\' (CoffeeStrength: ", codesys_coffeeStrength, ") has been ordered.".green);
				}
				else {
					if (valueCoffeeQuantity >= 90) {
						// make medium Coffee
						// console.log(new Date().toLocaleString('de-DE') + " DEBUG: make medium coffee");
						callMethodResult.statusCode = opcua.StatusCodes.Good;
						callMethodResult.outputArguments[0].value = "Bestellung ausgelöst: Ein normaler Kaffee wird für Sie zubereitet.";
						pressButton(NodeID_boolMediumCoffee);
						callback();
						console.log(new Date().toLocaleString('de-DE') + " Order completed: A \'Medium Coffee\' (CoffeeStrength: ", codesys_coffeeStrength, ") has been ordered.".green);
					}
					else {
						// make small Coffee
						// console.log(new Date().toLocaleString('de-DE') + " DEBUG: make small coffee");
						callMethodResult.statusCode = opcua.StatusCodes.Good;
						callMethodResult.outputArguments[0].value = "Bestellung ausgelöst: Ein kleiner Kaffee wird für Sie zubereitet.";
						pressButton(NodeID_boolSmallCoffee);
						callback();
						console.log(new Date().toLocaleString('de-DE') + " Order completed: A \'Small Coffee\' (CoffeeStrength: ", codesys_coffeeStrength, ") has been ordered.".green);
					}
				}
			}
		}],
		function (err) {
			// callback(err);
		}
	);
}

// The function post_initialize is used to construct the OPC UA address space for the CoffeeOrder Service. It also contains the toButton method's implementation.
async function post_initialize() {
	
	//	function to construct the address space
	function construct_address_space(server) {
		var addressSpace = server.engine.addressSpace;
		
		// Add MachineState Object to the namespace
		var MachineStateObject = addressSpace.addObject({
			organizedBy: addressSpace.rootFolder.objects,
			browseName: "MachineState",
			displayName: "MachineState Object",
			description: "Das Objekt für die Maschinendaten der Kaffeemaschine. Enthält Variablen wie Kaffeestand, Wasserstand, Reinigungszustand, ... zur Verwendung für Monitoring.",
			nodeId: "ns=1;s=MachineState"	// The NodeID of the MachineState Object: NamespaceIndex = 1, IdentifierType = string, Identifier = MachineState
		});
		
		// Add CoffeeLevel Variable to MachineState Object
		var CoffeeLevel = addressSpace.addVariable({
			componentOf: MachineStateObject,
			dataType: opcua.DataType.UInt16,	// ToDo: Vielleicht eignet sich ein anderer Datentyp besser, noch mal evaluieren sobald ich die Daten im Frontend verwende.
			description: "Die Variable für den Kaffeestand in der Kaffeemaschine. Gibt an, wie voll der Kaffeebohnen- oder -pulverbehälter prozentual ist. Der Wert sollte also zwischen 0 (leer) und 100 (voll) liegen.",
			browseName: "CoffeeLevel",
			currentRead: 0,
			currentWrite: 1,
			nodeId: "ns=1;s=CoffeeLevel",	// The NodeID of the CoffeeLevel Object: NamespaceIndex = 1, IdentifierType = string, Identifier = CoffeeLevel
			value: {	// implements get and set functions for the value
                get: function () {
                    return new opcua.Variant({dataType: opcua.DataType.UInt16, value: valueCoffeeLevel });
                },
                set: function (variant) {
                    valueCoffeeLevel = parseInt(variant.value);
                    return opcua.StatusCodes.Good;
                }
            }
		});
		
		// Add WaterLevel Variable to MachineState Object	
		var WaterLevel = addressSpace.addVariable ({
			componentOf: MachineStateObject,
			dataType: opcua.DataType.UInt16,	// ToDo: Vielleicht eignet sich ein anderer Datentyp besser, noch mal evaluieren sobald ich die Daten im Frontend verwende.
			description: "Die Variable für den Wasserstand in der Kaffeemaschine. Gibt an, wie voll der Wasserbehälter prozentual ist. Der Wert sollte also zwischen 0 (leer) und 100 (voll) liegen.",
			browseName: "WaterLevel",
			nodeId: "ns=1;s=WaterLevel",
			value: {	// implements get and set functions for the value
                get: function () {
                    return new opcua.Variant({dataType: opcua.DataType.UInt16, value: valueWaterLevel });
                },
                set: function (variant) {
                    valueWaterLevel = parseInt(variant.value);
                    return opcua.StatusCodes.Good;
                }
            }
		});
		
		// Add Cleanliness Variable to MachineState Object
		var Cleanliness = addressSpace.addVariable ({
			organizedBy: MachineStateObject,
			dataType: opcua.DataType.UInt16,	// ToDo: Vielleicht eignet sich ein anderer Datentyp besser, noch mal evaluieren sobald ich die Daten im Frontend verwende.
			description: "Die Variable für die Sauberkeit der Kaffeemaschine. Gibt einen ungefähren Richtwert an, wie Sauber die Maschine ist. Der Wert sollte zwischen 100 (frisch gereinigt) und 0 (Reinigung steht an) liegen.",
			browseName: "Cleanliness",
			nodeId: "ns=1;s=Cleanliness",
			value: {	// implements get and set functions for the value
                get: function () {
                    return new opcua.Variant({dataType: opcua.DataType.UInt16, value: valueCleanlinessLevel });
                },
                set: function (variant) {
                    valueCleanlinessLevel = parseInt(variant.value);
                    return opcua.StatusCodes.Good;
                }
            }
		});
		
		// Add CoffeeOrder Object to the namespace
		var CoffeeOrderObject = addressSpace.addObject({
			organizedBy: addressSpace.rootFolder.objects,
			browseName: "CoffeeOrder",
			displayName: "CoffeeOrder Object",
			description: "Das Objekt für eine Kaffeebestellung. Enthält Variablen für die Kaffee- und Milchmenge sowie für die Kaffeestärke. Außerdem stellt es Methoden bereit, mit der man die Kaffeebestellung an die Steuerung weitergeben kann.",
			nodeId: "ns=1;s=CoffeeOrder"	// The NodeID of the CoffeeOrder Object: NamespaceIndex = 1, IdentifierType = string, Identifier = CoffeeOrder
		});
		
		// Add CoffeeQuantity Variable to CoffeeOrder Object
		CoffeeQuantity = addressSpace.addVariable({
			componentOf: CoffeeOrderObject,
			browseName: "CoffeeQuantity",
			nodeId: "ns=1;s=CoffeeQuantityVariable",
			dataType: opcua.DataType.UInt16,
			description: "Die Variable für die Kaffeemenge, in ml.",
			value: {	// implements get and set functions for the value
                get: function () {
                    return new opcua.Variant({dataType: opcua.DataType.UInt16, value: valueCoffeeQuantity });
                },
                set: function (variant) {
                    valueCoffeeQuantity = parseInt(variant.value);
                    return opcua.StatusCodes.Good;
                }
            }
		});
		
		// Add MilkQuantity Variable to CoffeeOrder Object
		CoffeeQuantity = addressSpace.addVariable({
			componentOf: CoffeeOrderObject,
			browseName: "MilkQuantity",
			nodeId: "ns=1;s=MilkQuantityVariable",
			dataType: opcua.DataType.UInt16,
			description: "Die Variable für die Milchmenge, in ml.",
			value: {	// implements get and set functions for the value
                get: function () {
                    return new opcua.Variant({dataType: opcua.DataType.UInt16, value: valueMilkQuantity });
                },
                set: function (variant) {
                    valueMilkQuantity = parseInt(variant.value);
                    return opcua.StatusCodes.Good;
                }
            }
		});
		
		// Add CoffeeStrength Variable to CoffeeOrder Object
		CoffeeQuantity = addressSpace.addVariable({
			componentOf: CoffeeOrderObject,
			browseName: "CoffeeStrength",
			nodeId: "ns=1;s=CoffeeStrengthVariable",
			dataType: opcua.DataType.UInt16,
			description: "Die Variable für die Kaffeestärke. Möglich sind die Werte {1, 2, 3, 4, 5}.",
			value: {	// implements get and set functions for the value
                get: function () {
                    return new opcua.Variant({dataType: opcua.DataType.UInt16, value: valueCoffeeStrength });
                },
                set: function (variant) {
                    valueCoffeeStrength = parseInt(variant.value);
                    return opcua.StatusCodes.Good;
                }
            }
		});
		
		// Add toButtonMethod Method to CoffeeOrder Object (this is just the method shell without any code. For the code see "toButtonMethod.bindMethod(...)"" below)
		var toButtonMethod = addressSpace.addMethod(CoffeeOrderObject, {		// ToDo: Here we add the method shell (without the actual functional logic) to the OPC UA Server Address Space
			
			browseName: "toButton",
			nodeId: "ns=1;s=toButtonMethod",
			description: "Diese Methode löst die Kaffeebestellung an der Kaffeemaschine (über die CODESYS Steuerung) aus. Zuerst wird die Kaffeestärke auf der Kaffeemaschine korrekt eingestellt. Danach entscheidet die Methode anhand der internen Variablen des CoffeeOrder Node, ob ein kleiner/mittlerer/großer Kaffee oder ein Cappuccino am ehesten zu den Werten passt und löst schließlich die passende Produktion aus.",
			
			//	These would be the Input Arguments that must be passed to the method upon calling it.
			//	Not needed since the Method uses the internal values (valueCoffeeQuantity and valueMilkQuantity) 
			/*	
			inputArguments: [
				{
					name: "CoffeeQuantity",
					description: {text: "Die Menge an Kaffee in der Bestellung, in ml"},
					dataType: opcua.DataType.UInt16
				},
			],
			*/
			
			//	These are the output arguments that the method returns when called
			outputArguments: [{
				name: "MethodResponse",
				description: { text: "Informationen über das Resultat des Method Calls." },
				dataType: opcua.DataType.String
			}]
		});

		toButtonMethod.bindMethod(function (inputArguments, context, callback) {	// ToDo: Here we add functional logic to the created method shell.
			// local variables
			var callMethodResult = {
				statusCode: opcua.StatusCodes.Bad,	// Initialize with status code "Bad", only set to good once method executed successfully
				outputArguments: [{
					dataType: opcua.DataType.String
				}]
			};
			if (cooldown == true) {
				callMethodResult.outputArguments[0].value = "Fehler: Es wird gerade ein Kaffee zubereitet, bitte warten Sie einen Moment."; // "Method on cooldown";
				callMethodResult.statusCode = opcua.StatusCodes.Good;
				callback(null, callMethodResult);
			}
			else {	// Method currently not on cooldown
				if (!client_session) {	// checks if the session is null
					callMethodResult.outputArguments[0].value = "Fehler: keine Session beim Codesys Server!";
					callMethodResult.statusCode = opcua.StatusCodes.Good;
					callback(null, callMethodResult);
				}
				else {	// Method currently not on cooldown and session with Codesys exists
					if (codesys_stringPackMLStatus != "IDLE") {
						callMethodResult.outputArguments[0].value = "Fehler: die Kaffeemaschine ist gerade nicht betriebsbereit!";
						callMethodResult.statusCode = opcua.StatusCodes.Good;
						callback(null, callMethodResult);
					}
					else {	// at this point we have validated cooldown, session and packML state
						cooldown = true;	// Flag Method for Cooldown
						setTimeout(() => resetCooldown(), (cooldowntime * 1000));	// reset cooldown after (cooldowntime) seconds
						async.series(	// using async.series to ensure these steps are executed in the correct order.
							[
								// First we need to set the correct coffe strength
								function (callback2) {
									console.log(new Date().toLocaleString('de-DE') + " DEBUG async.series step 1: set coffee strength");
									setCoffeeStrength(callback2);
								},
								// now we are ready to produce the coffee
								function (callback3) {
									console.log(new Date().toLocaleString('de-DE') + " DEBUG async.series step 2: make coffee");
									makeCoffee(callMethodResult, callback3); // callMethodResult is passed to the function so that the results can be written depending on which coffee has been produced.
								}
							],	// lastly we return the CallMethodResult to the method call via the callback (this is the callback of toButtonMethod.bindMethod)
							function (err, callback2) {
								console.log(new Date().toLocaleString('de-DE') + " DEBUG: async.series completed. Coffee should have been ordered...")
								callback(null, callMethodResult);
							}
						);
					}
				}
			}
		});

	}
	construct_address_space(server);	// Call function to construct the server address space.
}

// Display information about newly created or closed sessions
server.on("create_session", function (session) {
    console.log(new Date().toLocaleString('de-DE') + " Server: A new session has been created :".yellow);
    console.log("   	session name: ", session.sessionName ? session.sessionName.toString() : "<null>");
	console.log("   	client application name: ", session.clientDescription.applicationName.toString());
    console.log("   	client application type: ", session.clientDescription.applicationType.toString());
    console.log("   	session timeout: ", session.sessionTimeout);
	console.log("   	session id: ", session.sessionId);
	session.clientDescription.sec
});

server.on("session_closed", function (session, reason) {
    console.log(new Date().toLocaleString('de-DE') + " Server: A session has been closed :".yellow);
    console.log("   	session name: ", session.sessionName ? session.sessionName.toString() : "<null>");
    console.log("   	client application name: ", session.clientDescription.applicationName.toString());
});

//		*********************************
//		*								*
//		*	ACTUAL PROGRAM STARTS HERE	*
//		*								*
//		*********************************


server.initialize(post_initialize);		// initialize the server and construct the address space
ClientConnection();						// connect to Codesys
server.start(function () {				// start the OPC UA Server
	console.log(new Date().toLocaleString('de-DE') + " Server is now listening ...".yellow, "( press CTRL+C twice to stop)".red);
	console.log(new Date().toLocaleString('de-DE') + " Server port: ".yellow, server.endpoints[0].port);
	var endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
	console.log(new Date().toLocaleString('de-DE') + " Server: the primary server endpoint url is \n	".yellow, endpointUrl.magenta);

	// after the OPC UA Server has been started:
	// listen for commands typed by the user and call functions linked to commands
	if (enableAddUser) {
		commandHelp();
		rl.prompt();
		rl.on('line', (line) => {
			switch (line.trim()) {
				case 'help':
					commandHelp();
					break;
				case 'add':
					commandAddUser();
					break;
				case 'users':
					commandLogAvailableUsers()
					break;
				case 'randomize':
					CommandRandomizeMachinedata()
					break;
				default:
				console.log("Unknown command. Type \"help\" to list all available commands.".red);
					break;
			}
		});
	}
	else {
		console.log("Adding users is disabled. Re-enable it by setting enableAddUser = true; in the code.").red;
		rl.on('line', (line) => {
			switch (line.trim()) {
				default:
					console.log("--- COMMANDS DISABLED - Re-enable by setting enableAddUser = true; ---".red);
					break;
			}
		});
	}
});