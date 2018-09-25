/* ========================================================================
 * Copyright (c) 2005-2018 The OPC Foundation, Inc. All rights reserved.
 *
 * OPC Foundation MIT License 1.00
 * 
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 * 
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 *
 * The complete license agreement can be found here:
 * http://opcfoundation.org/License/MIT/1.00/
 * ======================================================================*/


using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Opc.Ua;
using Opc.Ua.Client;
using System.Security.Cryptography.X509Certificates;
using Xamarin.Forms;
using System.Net;
using Opc.Ua.Configuration;
using System.IO;
using Android.Content.Res;

namespace AIS_Demonstrator
{
    public class SampleClient
    {
        public enum ConnectionStatus
        {
            None,
            NotConnected,
            Connected,
            Error
        }

        public ConnectionStatus connectionStatus;
        public bool haveAppCertificate;
        public Session session;
        SessionReconnectHandler reconnectHandler;
        const int ReconnectPeriod = 10;
        public string debug { get; set; }
        public int valueCoffeeLevel;
        public int valueWaterLevel;
        public int valueCleanlinessLevel;
        public string ServerCertPath;   // Path to the file of the server certification in the device's storage
        public string ClientCertPath;   // Path to the file of the client certification in the device's storage
        public string configPath;       // Path to the file of the client configuration in the device's storage

        private LabelViewModel info;
        private ApplicationConfiguration config;

        public SampleClient(LabelViewModel text)
        {
            connectionStatus = ConnectionStatus.None;
            session = null;
            info = text;
            haveAppCertificate = false;
            config = null;
            debug = "constructor debug string";
            valueCoffeeLevel = 0;
            valueWaterLevel = 0;
            valueCleanlinessLevel = 0;
        }

        public async void CreateCertificate(AssetManager assets)
        {
            ApplicationInstance application = new ApplicationInstance
            {
                ApplicationType = ApplicationType.Client,
                ConfigSectionName = "Opc.Ua.AIS_Demonstrator"   /// [...] sets the name of the config section containing the path to the application configuration file.
            };

            /*
            // Old code to find location of config.xml file + load its content into "context" variable.
            // Instead, the CreateCertificate Variable is now called with the content string as a parameter since the AssetManager needs to be instantiated in an Activity
            string currentFolder = DependencyService.Get<IPathService>().PublicExternalFolder.ToString();
            string filename = application.ConfigSectionName + ".Config.xml";    
            string content = DependencyService.Get<IAssetService>().LoadFile(filename);
            File.WriteAllText(currentFolder + filename, content);
            */

            // new code to find location of config.xml file + load its content into "context" variable
            // the CreateCertificate Variable is now called with the content string as a parameter since the AssetManager needs to be instantiated in an Activity
            string configFilename = application.ConfigSectionName + ".Config.xml";
            string serverCertFilename = "server_selfsigned_cert_2048.pem";
            string clientCertFilename = "client_selfsigned_cert_2048.pem";
            string currentFolder = Environment.GetFolderPath(Environment.SpecialFolder.Personal); // gets the path of the Internal Storage as a string
            string PKIPath = "/storage/emulated/0/OPC Foundation/PKI/";
            Directory.CreateDirectory(PKIPath + "trusted/");
            Directory.CreateDirectory(PKIPath + "own/");
            ServerCertPath = PKIPath + "trusted/" + serverCertFilename;
            ClientCertPath = PKIPath + "own/" + clientCertFilename;
            configPath = currentFolder + configFilename;

            // in case the config file doesn't exist: create new config file in internal storage as a copy of the Asset config
            if (!File.Exists(currentFolder + configFilename))
            {
                string content;
                using (StreamReader sr = new StreamReader(assets.Open(configFilename)))
                {
                    content = sr.ReadToEnd();
                } 
                File.WriteAllText(currentFolder + configFilename, content); 
                
            }
            else
            {   // The config file already exists
                // Load configuration from file
                config = await application.LoadApplicationConfiguration(currentFolder + configFilename, false);
            }
            // in case the client certificate file doesn't exist: create new certificate file in internal storage as a copy of the Asset client certificate
            /* if (!File.Exists(currentFolder + clientCertFilename))
            {
                string content;
                using (StreamReader sr = new StreamReader(assets.Open(clientCertFilename)))
                {
                    content = sr.ReadToEnd();
                }
                File.WriteAllText(currentFolder + clientCertFilename, content);
            } */
            
            // in case the server certificate file doesn't exist: create new certificate file in internal storage as a copy of the Asset server certificate
            if (!File.Exists(ServerCertPath))
            {
                assets.Open(serverCertFilename).CopyTo(File.Create(ServerCertPath));
                /* string content;
                using (StreamReader sr = new StreamReader(assets.Open(serverCertFilename)))
                {
                    content = sr.ReadToEnd();
                }
                File.WriteAllText(ServerCertPath, content);*/
            }



            // check the application certificate.
            haveAppCertificate = await application.CheckApplicationInstanceCertificate(false, 0);
            // haveAppCertificate = config.SecurityConfiguration.ApplicationCertificate.Certificate != null;   // ToDo Delete this line or the one above

            // Create a new app certificate if no certificate is present
            if (!haveAppCertificate)
            {
                X509Certificate2 appCertificate = CertificateFactory.CreateCertificate(
                       config.SecurityConfiguration.ApplicationCertificate.StoreType,       // string storeType
                       config.SecurityConfiguration.ApplicationCertificate.StorePath,       // string storePath
                       null,                                                                // string password
                       config.ApplicationUri,                                               // string applicationUri
                       config.ApplicationName,                                              // string applicationName
                       config.SecurityConfiguration.ApplicationCertificate.SubjectName,     // string subjectName
                       null,                                                                // IList<string> domainNames
                       2048,                                                                // ushort KeySize
                       DateTime.UtcNow - TimeSpan.FromDays(1),                              // DateTime startDate
                       24,                                                                  // ushort lifetimeInMonths
                       256,                                                                 // ushort hashSizeInBits
                       false,                                                               // bool isCA; default = false
                       null,                                                                // X509certificate2 issuerCACertKey
                       null                                                                 // byte[] publicKey; default = null
                       );

                config.SecurityConfiguration.ApplicationCertificate.Certificate = appCertificate;

            }

            if (haveAppCertificate)
            {
                config.ApplicationUri = Utils.GetApplicationUriFromCertificate(config.SecurityConfiguration.ApplicationCertificate.Certificate);

                config.CertificateValidator.CertificateValidation += new CertificateValidationEventHandler(CertificateValidator_CertificateValidation);
            }
        }

        public async Task<ConnectionStatus> OpcClient(string endpointURL)
        {
            try
            {
                Uri endpointURI = new Uri(endpointURL);
                var selectedEndpoint = CoreClientUtils.SelectEndpoint(endpointURL, false, 15000);

                info.LabelText = "Selected endpoint uses: " + selectedEndpoint.SecurityPolicyUri.Substring(selectedEndpoint.SecurityPolicyUri.LastIndexOf('#') + 1);

                var endpointConfiguration = EndpointConfiguration.Create(config);
                var endpoint = new ConfiguredEndpoint(selectedEndpoint.Server, endpointConfiguration);
                endpoint.Update(selectedEndpoint);

                var platform = Device.RuntimePlatform;
                var sessionName = "";

                switch (Device.RuntimePlatform)
                {
                    case "Android":
                        sessionName = "AIS Demonstrator Android Applikation";
                        break;
                    // other cases are irrelevant for the Industrie 4.0 Demonstrator as of now
                    case "UWP":
                        sessionName = "OPC UA Xamarin Client UWP";
                        break;
                    case "iOS":
                        sessionName = "OPC UA Xamarin Client IOS";
                        break;
                }
                #region Copied from github Issues 446
                /*
                 * Copied from https://github.com/OPCFoundation/UA-.NETStandard/issues/446
                 */
                UserTokenPolicy utp = new UserTokenPolicy();
                utp.TokenType = UserTokenType.UserName;

                UserTokenPolicyCollection utpCollection = new UserTokenPolicyCollection();
                utpCollection.Add(utp);
                selectedEndpoint.UserIdentityTokens = utpCollection;
                selectedEndpoint.SecurityMode = MessageSecurityMode.SignAndEncrypt;
                UserIdentity SessionUserIdentity = new UserIdentity(MainActivity.UserName, MainActivity.UserPassword);

                #endregion
                session = await Session.Create(config, endpoint, false, sessionName, 30000, SessionUserIdentity, null);


                if (session != null)
                {
                    connectionStatus = ConnectionStatus.Connected;

                    #region Subscription + monitoredItems
                    // Code for Monitored Items based on http://opcfoundation.github.io/UA-.NETStandard/help/index.htm#client_development.htm

                    // Create ´Subscription
                    Subscription subscription = new Subscription() // new Subscription(OpcClient.session.DefaultSubscription)
                    {
                        PublishingInterval = 1000,
                        PublishingEnabled = true
                    };
                    // CoffeeLevel
                    MonitoredItem CoffeeLevel = new MonitoredItem(subscription.DefaultItem)
                    {
                        StartNodeId = "ns=1;s=CoffeeLevel",
                        DisplayName = "MonitoredCoffeeLevel",
                        AttributeId = Attributes.Value,
                        MonitoringMode = MonitoringMode.Reporting,
                        SamplingInterval = 1000,    // check the CoffeeLevel every second
                        QueueSize = 1,  // only the most recent value for the CoffeeLevel is needed, thus we only need a queuesize of one
                        DiscardOldest = true    // we only need the most recent value for CoffeeLevel
                    };
                    CoffeeLevel.Notification += (sender, e) => OnNotification(sender, e, ref valueCoffeeLevel);

                    // WaterLevel
                    MonitoredItem WaterLevel = new MonitoredItem(subscription.DefaultItem)
                    {
                        StartNodeId = "ns=1;s=WaterLevel",
                        DisplayName = "MonitoredWaterLevel",
                        AttributeId = Attributes.Value,
                        MonitoringMode = MonitoringMode.Reporting,
                        SamplingInterval = 1000,    // check the CoffeeLevel every second
                        QueueSize = 1,  // only the most recent value for the CoffeeLevel is needed, thus we only need a queuesize of one
                        DiscardOldest = true    // we only need the most recent value for CoffeeLevel
                    };
                    WaterLevel.Notification += (sender, e) => OnNotification(sender, e, ref valueWaterLevel);

                    // CleanlinessLevel
                    MonitoredItem CleanlinessLevel = new MonitoredItem(subscription.DefaultItem)
                    {
                        StartNodeId = "ns=1;s=Cleanliness",
                        DisplayName = "MonitoredCleanlinessLevel",
                        AttributeId = Attributes.Value,
                        MonitoringMode = MonitoringMode.Reporting,
                        SamplingInterval = 1000,    // check the CoffeeLevel every second
                        QueueSize = 1,  // only the most recent value for the CoffeeLevel is needed, thus we only need a queuesize of one
                        DiscardOldest = true    // we only need the most recent value for CoffeeLevel
                    };
                    CleanlinessLevel.Notification += (sender, e) => OnNotification(sender, e, ref valueCleanlinessLevel);

                    // add MonitoredItems to Subscription
                    subscription.AddItem(CoffeeLevel);
                    subscription.AddItem(WaterLevel);
                    subscription.AddItem(CleanlinessLevel);

                    // add Subscription to Session
                    session.AddSubscription(subscription);
                    subscription.Create();

                    #endregion
                }
                else
                {
                    connectionStatus = ConnectionStatus.NotConnected;
                }
                // register keep alive handler
                session.KeepAlive += Client_KeepAlive;
            }
            catch
            {
                connectionStatus = ConnectionStatus.Error;
            }
            return connectionStatus;
        }

        public void Disconnect(Session session)
        {
            if (session != null)
            {
                if (info != null)
                {
                    info.LabelText = "";
                }

                session.Close();
            }
        }

        // Notification Event Handler (Method to write a value from OPC UA notifications to a local variable)
        private static void OnNotification(MonitoredItem item, MonitoredItemNotificationEventArgs e, ref int variable)
        {
            foreach (var value in item.DequeueValues())
            {
                variable = value.GetValue<UInt16>(0);  // assigns the referenced 'variable' (e.g. valueCoffeeLevel) the value of the Monitored Item.
            }
        }

        // KeepAlive Event Handler
        private void Client_KeepAlive(Session sender, KeepAliveEventArgs e)
        {
            if (e.Status != null && ServiceResult.IsNotGood(e.Status))
            {
                info.LabelText = e.Status.ToString() + sender.OutstandingRequestCount.ToString() + "/" + sender.DefunctRequestCount.ToString();

                if (reconnectHandler == null)
                {
                    info.LabelText = "--- RECONNECTING ---";
                    reconnectHandler = new SessionReconnectHandler();
                    reconnectHandler.BeginReconnect(sender, ReconnectPeriod * 1000, Client_ReconnectComplete);
                }
            }
        }

        private void Client_ReconnectComplete(object sender, EventArgs e)
        {
            // ignore callbacks from discarded objects.
            if (!Object.ReferenceEquals(sender, reconnectHandler))
            {
                return;
            }

            session = reconnectHandler.Session;
            reconnectHandler.Dispose();
            reconnectHandler = null;

            info.LabelText = "--- RECONNECTING ---";
        }

        #region DeactivatedFeatures
        // Original Features from the .NET Sample Client implementation, not needed for this OPC UA Client
        /*
        public Tree GetRootNode(LabelViewModel textInfo)
        {
            ReferenceDescriptionCollection references;
            Byte[] continuationPoint;
            Tree browserTree = new Tree();
            
            try
            {
                session.Browse(
                    null,
                    null,
                    ObjectIds.ObjectsFolder,
                    0u,
                    BrowseDirection.Forward,
                    ReferenceTypeIds.HierarchicalReferences,
                    true,
                    0,
                    out continuationPoint,
                    out references);

                browserTree.currentView.Add(new ListNode { id = ObjectIds.ObjectsFolder.ToString(), NodeName = "Root", children = (references?.Count != 0) });

                return browserTree;
            }
            catch 
            {
                Disconnect(session);
                return null;
            }
        }

        public Tree GetChildren(string node)
        {
            ReferenceDescriptionCollection references;
            Byte[] continuationPoint;
            Tree browserTree = new Tree();

            try
            {
                session.Browse(
                    null,
                    null,
                    node,
                    0u,
                    BrowseDirection.Forward,
                    ReferenceTypeIds.HierarchicalReferences,
                    true,
                    0,
                    out continuationPoint,
                    out references);

                if (references != null)
                {
                    foreach (var nodeReference in references)
                    {
                        ReferenceDescriptionCollection childReferences = null;
                        Byte[] childContinuationPoint;

                        session.Browse(
                            null,
                            null,
                            ExpandedNodeId.ToNodeId(nodeReference.NodeId, session.NamespaceUris),
                            0u,
                            BrowseDirection.Forward,
                            ReferenceTypeIds.HierarchicalReferences,
                            true,
                            0,
                            out childContinuationPoint,
                            out childReferences);

                        INode currentNode = null;
                        try
                        {
                            currentNode = session.ReadNode(ExpandedNodeId.ToNodeId(nodeReference.NodeId, session.NamespaceUris));
                        }
                        catch (Exception)
                        {
                            // skip this node
                            continue;
                        }

                        byte currentNodeAccessLevel = 0;
                        byte currentNodeEventNotifier = 0;
                        bool currentNodeExecutable = false;

                        VariableNode variableNode = currentNode as VariableNode;
                        if (variableNode != null)
                        {
                            currentNodeAccessLevel = variableNode.UserAccessLevel;
                            currentNodeAccessLevel = (byte)((uint)currentNodeAccessLevel & ~0x2);
                        }

                        ObjectNode objectNode = currentNode as ObjectNode;
                        if (objectNode != null)
                        {
                            currentNodeEventNotifier = objectNode.EventNotifier;
                        }

                        ViewNode viewNode = currentNode as ViewNode;
                        if (viewNode != null)
                        {
                            currentNodeEventNotifier = viewNode.EventNotifier;
                        }

                        MethodNode methodNode = currentNode as MethodNode;
                        if (methodNode != null)
                        {
                            currentNodeExecutable = methodNode.UserExecutable;
                        }

                        browserTree.currentView.Add(new ListNode()
                        {
                            id = nodeReference.NodeId.ToString(),
                            NodeName = nodeReference.DisplayName.Text.ToString(),
                            nodeClass = nodeReference.NodeClass.ToString(),
                            accessLevel = currentNodeAccessLevel.ToString(),
                            eventNotifier = currentNodeEventNotifier.ToString(),
                            executable = currentNodeExecutable.ToString(),
                            children = (references?.Count != 0),
                            ImageUrl = (nodeReference.NodeClass.ToString() == "Variable") ? "folderOpen.jpg" : "folder.jpg"
                        });
                        if (browserTree.currentView[0].ImageUrl == null)
                        {
                            browserTree.currentView[0].ImageUrl = "";
                        }
                    }
                    if (browserTree.currentView.Count == 0)
                    {
                        INode currentNode = session.ReadNode(new NodeId(node));

                        byte currentNodeAccessLevel = 0;
                        byte currentNodeEventNotifier = 0;
                        bool currentNodeExecutable = false;

                        VariableNode variableNode = currentNode as VariableNode;

                        if (variableNode != null)
                        {
                            currentNodeAccessLevel = variableNode.UserAccessLevel;
                            currentNodeAccessLevel = (byte)((uint)currentNodeAccessLevel & ~0x2);
                        }

                        ObjectNode objectNode = currentNode as ObjectNode;

                        if (objectNode != null)
                        {
                            currentNodeEventNotifier = objectNode.EventNotifier;
                        }

                        ViewNode viewNode = currentNode as ViewNode;

                        if (viewNode != null)
                        {
                            currentNodeEventNotifier = viewNode.EventNotifier;
                        }

                        MethodNode methodNode = currentNode as MethodNode;

                        if (methodNode != null )
                        {
                            currentNodeExecutable = methodNode.UserExecutable;
                        }

                        browserTree.currentView.Add(new ListNode()
                        {
                            id = node,
                            NodeName = currentNode.DisplayName.Text.ToString(),
                            nodeClass = currentNode.NodeClass.ToString(),
                            accessLevel = currentNodeAccessLevel.ToString(),
                            eventNotifier = currentNodeEventNotifier.ToString(),
                            executable = currentNodeExecutable.ToString(),
                            children = false,
                            ImageUrl = null
                        });
                    }
                }
                return browserTree;
            }
            catch
            {
                Disconnect(session);
                return null;
            }
        } */
        #endregion

        #region custom Variable Write Method
        /// <summary>
        /// Returns the ServiceResult from the ResponseHeader of the Variable Write Operation
        /// </summary>
        /// <param name="value">The int value that is to be written to the Node in the Server Namespace.</param>
        /// <param name="nodeId">The NodeId of the Node where the value shall be written.</param>
        public ResponseHeader VariableWrite(UInt16 value, string nodeId)
        {
            if (session != null)
            {
                if (session.Connected)
                {
                    StatusCodeCollection results = null;
                    DiagnosticInfoCollection diagnosticInfos = null;
                    // create a new WriteValueCollection (needed to call the Write Mehtod of the session)
                    WriteValueCollection nodesToWrite = new WriteValueCollection();
                    nodesToWrite.Add(new WriteValue
                    {
                        // NodeId of the Node to write
                        NodeId = NodeId.Parse(nodeId),
                        // We want to write the Value of the Node
                        AttributeId = Attributes.Value,
                        Value = new DataValue() { WrappedValue = value }
                    });
                    // Actually write the Data. The method session.Write returns the responseHeader of the Write request response which is passed as the return value of this Method (VariableWrite)
                    ResponseHeader responseHeader = session.Write(null, nodesToWrite, out results, out diagnosticInfos);
                    return responseHeader;
                }
                else return null;
            }
            else return null;
        }
        #endregion

        // currently unused, but might be useful to read the MachineState upon App initialization / first creation of OverviewFragment ?
        public string VariableRead(string nodeId)
        {
            try
            {
                DataValueCollection values = null;
                DiagnosticInfoCollection diagnosticInfos = null;
                ReadValueIdCollection nodesToRead = new ReadValueIdCollection();
                ReadValueId valueId = new ReadValueId();
                valueId.NodeId = new NodeId(nodeId);
                valueId.AttributeId = Attributes.Value;
                valueId.IndexRange = null;
                valueId.DataEncoding = null;
                nodesToRead.Add(valueId);
                ResponseHeader responseHeader = session.Read(null, 0, TimestampsToReturn.Both, nodesToRead, out values, out diagnosticInfos);
                string value = "";
                if (values[0].Value != null)
                {
                    var rawValue = values[0].WrappedValue.ToString();
                    value = rawValue.Replace("|", "\r\n").Replace("{", "").Replace("}", "");
                }
                return value;
            }
            catch
            {
                return null;
            }
        }

        private void CertificateValidator_CertificateValidation(CertificateValidator validator, CertificateValidationEventArgs e)
        {
            if (e.Error.StatusCode == StatusCodes.BadCertificateUntrusted)
            {
                e.Accept = config.SecurityConfiguration.AutoAcceptUntrustedCertificates;
                if (config.SecurityConfiguration.AutoAcceptUntrustedCertificates)
                {
                    info.LabelText = "Accepted Certificate: " + e.Certificate.Subject.ToString();
                }
                else
                {
                    info.LabelText = "Rejected Certificate: " + e.Certificate.Subject.ToString();
                }
            }
        }
    }
}
