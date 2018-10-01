using System;
using System.Collections.Generic;
using AIS_Demonstrator.Dialogs;
using Android.App;
using Android.Graphics;
// ReSharper disable once RedundantUsingDirective
using Android.Graphics;
using Android.OS;
using Android.App;
using Android.Support.V4.View;
using Android.Util;
using Android.Views;
using Android.Widget;
using AlertDialog = Android.Support.V7.App.AlertDialog;
using FragmentTransaction = Android.Support.V4.App.FragmentTransaction;

// Added for OPC UA Support
using Opc.Ua;

namespace AIS_Demonstrator.Fragments
{
    public class OverviewFragment : Android.Support.V4.App.Fragment
    {
        private TextView _textOptionProfile;
        private TextView _textOptionCostOverview;
        private TextView _textOptionMachine;
        private TextView _textOptionCostSetting;
        private TextView _textOptionRefresh;
        private TextView _textOptionPower;
        private View _view;
        private ViewPager _pager;
        public override View OnCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState)
        {
            base.OnCreateView(inflater, container, savedInstanceState);

            _view = inflater.Inflate(Resource.Layout.Overview, container, false);

            //TextView Button
            _textOptionProfile = _view.FindViewById<TextView>(Resource.Id.textOptionProfile);
            _textOptionProfile.Click += OptionProfile_Click;
            //Use this in addition if Login is disabled
            _textOptionProfile.Enabled = false;
            _textOptionProfile.SetBackgroundColor(Color.Gray);

            _textOptionCostOverview = _view.FindViewById<TextView>(Resource.Id.textOptionCostOverview);
            _textOptionCostOverview.Click += OptionCostOverview_Click;
            //Use this in addition if Login is disabled
            _textOptionCostOverview.Enabled = false;
            _textOptionCostOverview.SetBackgroundColor(Color.Gray);

            _textOptionMachine = _view.FindViewById<TextView>(Resource.Id.textOptionMachine);
            _textOptionMachine.Click += OptionMachine_Click;
            //Use this in addition if Login is disabled
            _textOptionMachine.Enabled = false;
            _textOptionMachine.SetBackgroundColor(Color.Gray);

            _textOptionCostSetting = _view.FindViewById<TextView>(Resource.Id.textOptionCostSetting);
            _textOptionCostSetting.Click += OptionCostSetting_Click;
            //Use this in addition if Login is disabled
            _textOptionCostSetting.Enabled = false;
            _textOptionCostSetting.SetBackgroundColor(Color.Gray);

            // Click handler for the "Refresh machine data" button. Added for OPC UA Support
            _textOptionRefresh = _view.FindViewById<TextView>(Resource.Id.refreshMachineState);
            _textOptionRefresh.Click += OptionRefresh_Click;

            // Click handler for the "Kaffeemaschine An-/Ausschalten" button. Added for OPC UA Support
            _textOptionPower = _view.FindViewById<TextView>(Resource.Id.togglePower);
            _textOptionPower.Click += OptionPower_Click;

            SetupContainerMachineState(ref MainActivity.OpcClient.valueCoffeeLevel, ref MainActivity.OpcClient.valueWaterLevel, ref MainActivity.OpcClient.valueCleanlinessLevel);
            return _view;
        }
      
        //Show Profile via MenuPager
        private void OptionProfile_Click(object sender, EventArgs e)
        {
            _pager = Activity.FindViewById<ViewPager>(Resource.Id.pager);
            _pager.SetCurrentItem(2, true);
        }

        //Show Cost Overview DialogFragment
        private void OptionCostOverview_Click(object sender, EventArgs e)
        {
            CostOverviewDialog costOverviewDialog = new CostOverviewDialog();
            FragmentTransaction transaction = Activity.SupportFragmentManager.BeginTransaction()
                .SetCustomAnimations(Resource.Animation.enter_from_left, Resource.Animation.exit_to_left)
                .Add(Resource.Id.main_content, costOverviewDialog)
                .AddToBackStack("costOverviewDialog");
            transaction.Commit();
            Activity.SupportFragmentManager.ExecutePendingTransactions();
        }

        // Refresh OverviewFragment in order to re-render the MachineData bars
        private void OptionRefresh_Click(object sender, EventArgs e)
        {
            SetupContainerMachineState(ref MainActivity.OpcClient.valueCoffeeLevel, ref MainActivity.OpcClient.valueWaterLevel, ref MainActivity.OpcClient.valueCleanlinessLevel);
            _view.RefreshDrawableState();
        }

        // Click Handler: Power Button that calls the OPC UA Power method in order to turn the Coffee Machine on/off
        private void OptionPower_Click(object sender, EventArgs e)
        {
            // Variables for handling the Method Call Result
            IList<object> callpowerMethodResult = null;
            string resultMessage = "Fehler: Kommunikation mit dem Backend ist fehlgeschlagen";  // default value is overwritten later when the toButton Method is successfully called.

            NodeId ObjectNodeID = NodeId.Parse("ns=1;s=CoffeeOrder");
            NodeId MethodNodeID = NodeId.Parse("ns=1;s=powerMethod");

            //Create Alert Dialog
            AlertDialog.Builder alert = new AlertDialog.Builder(Activity);
            alert.SetTitle("Kaffeemaschine An-/Ausschalten");
            alert.SetMessage("Achtung: möchten Sie wirklich den Power-Button der Kaffeemaschine betätigen?");
            alert.SetPositiveButton("Ja", (senderAlert, args) => {
                if (MainActivity.OpcClient.session.Connected) {
                    // Actually call the power Button method
                    callpowerMethodResult = MainActivity.OpcClient.session.Call(ObjectNodeID, MethodNodeID, null);
                    foreach (var x in callpowerMethodResult)
                    {
                        resultMessage = x.ToString();
                    }
                }
                Toast.MakeText(Activity, resultMessage, ToastLength.Short).Show();
            });
            alert.SetNegativeButton("Nein", (senderAlert, args) => {
                Toast.MakeText(Activity, "Abgebrochen", ToastLength.Short).Show();
            });
            alert.Show();
        }

        //Create Alert Dialog For Power Button Click Handler
        private void CreateAlertPower()
        {
            
        }

        //Show Machine Setting DialogFragment
        private void OptionMachine_Click(object sender, EventArgs e)
        {
            MachineSettingDialog machineSettingDialog = new MachineSettingDialog();
            FragmentTransaction transaction = Activity.SupportFragmentManager.BeginTransaction()
                .SetCustomAnimations(Resource.Animation.enter_from_left, Resource.Animation.exit_to_left)
                .Add(Resource.Id.main_content, machineSettingDialog)
                .AddToBackStack("machineSettingDialog");
            transaction.Commit();
            Activity.SupportFragmentManager.ExecutePendingTransactions();
        }

        //Show Cost Setting DialogFragment
        private void OptionCostSetting_Click(object sender, EventArgs e)
        {
            CostSettingDialog costSettingDialog = new CostSettingDialog();
            FragmentTransaction transaction = Activity.SupportFragmentManager.BeginTransaction()
                .SetCustomAnimations(Resource.Animation.enter_from_left, Resource.Animation.exit_to_left)
                .Add(Resource.Id.main_content, costSettingDialog)
                .AddToBackStack("costSettingDialog");
            transaction.Commit();
            Activity.SupportFragmentManager.ExecutePendingTransactions();
        }

        //Sets Height for MachineState Levels dynamicly
        private void SetupContainerMachineState(ref int CoffeeLevel, ref int WaterLevel, ref int CleanlinessLevel)
        {
            //Get Container Height
            DisplayMetrics displayMetrics = Activity.Resources.DisplayMetrics;
            float layoutWeight = 0.5f;
            float height = displayMetrics.WidthPixels * layoutWeight; //Get Height of Container MachineState
            height = height - 90; //Subtract Padding and Text | used to be 60, but increased to 90 when the Refresh MachineState Button was added

            //Find Views
            View wL1 = _view.FindViewById<View>(Resource.Id.WaterLevel1);
            View wL2 = _view.FindViewById<View>(Resource.Id.WaterLevel2);

            View bL1 = _view.FindViewById<View>(Resource.Id.BeanLevel1);
            View bL2 = _view.FindViewById<View>(Resource.Id.BeanLevel2);

            View cL1 = _view.FindViewById<View>(Resource.Id.CleanLevel1);
            View cL2 = _view.FindViewById<View>(Resource.Id.CleanLevel2);

            //Calculate decimal value from OPC UA passed percent value
            float dWaterLevel = ((float) WaterLevel) / 100;
            float dCoffeeLevel = ((float) CoffeeLevel) / 100;
            float dCleanlinessLevel = ((float) CleanlinessLevel) / 100;



            //Set Height
            wL1.SetMinimumHeight((int)Math.Round(height * dWaterLevel));    // triggers the refresh of the view for some reason
            wL1.LayoutParameters.Height = (int)Math.Round(height * dWaterLevel);
            wL2.LayoutParameters.Height = (int)Math.Round(height * (1 - dWaterLevel));
            //wL2.SetMinimumHeight((int)Math.Round(height * (1 - dWaterLevel)));
            bL1.LayoutParameters.Height = (int)Math.Round(height * dCoffeeLevel);
            bL2.LayoutParameters.Height = (int)Math.Round(height * (1 - dCoffeeLevel) );

            cL1.LayoutParameters.Height = (int)Math.Round(height * dCleanlinessLevel);
            cL2.LayoutParameters.Height = (int)Math.Round(height * (1 - dCleanlinessLevel) );


            _view.FindViewById<View>(Resource.Id.ContainerMachineState).ForceLayout();
        }
    }
}