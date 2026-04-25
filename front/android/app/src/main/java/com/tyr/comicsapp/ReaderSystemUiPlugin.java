package com.tyr.comicsapp;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.os.BatteryManager;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ReaderSystemUi")
public class ReaderSystemUiPlugin extends Plugin {
    private boolean savedState = false;
    private int previousSystemUiVisibility = 0;
    private int previousStatusBarColor = Color.BLACK;
    private int previousNavigationBarColor = Color.BLACK;

    @PluginMethod
    public void enterImmersive(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                saveState(activity.getWindow());
                applyImmersive(activity.getWindow());
                call.resolve();
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "Failed to enter immersive mode" : error.getMessage());
            }
        });
    }

    @PluginMethod
    public void exitImmersive(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                restoreState(activity.getWindow());
                call.resolve();
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "Failed to exit immersive mode" : error.getMessage());
            }
        });
    }

    @PluginMethod
    public void getDeviceStatus(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve(new JSObject());
            return;
        }

        call.resolve(readDeviceStatus(activity));
    }

    private JSObject readDeviceStatus(Activity activity) {
        JSObject result = new JSObject();
        Context context = activity.getApplicationContext();
        int batteryLevel = -1;
        boolean isCharging = false;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            BatteryManager batteryManager = (BatteryManager) context.getSystemService(Context.BATTERY_SERVICE);
            if (batteryManager != null) {
                batteryLevel = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
            }
        }

        Intent batteryStatus = context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (batteryStatus != null) {
            int status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING
                || status == BatteryManager.BATTERY_STATUS_FULL;

            if (batteryLevel < 0) {
                int level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                if (level >= 0 && scale > 0) {
                    batteryLevel = Math.round(level * 100f / scale);
                }
            }
        }

        if (batteryLevel >= 0) {
            result.put("batteryLevel", Math.max(0, Math.min(100, batteryLevel)));
        }
        result.put("isCharging", isCharging);
        return result;
    }

    private void saveState(Window window) {
        if (savedState) return;

        previousSystemUiVisibility = window.getDecorView().getSystemUiVisibility();
        previousStatusBarColor = window.getStatusBarColor();
        previousNavigationBarColor = window.getNavigationBarColor();
        savedState = true;
    }

    private void applyImmersive(Window window) {
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
            return;
        }

        window.getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    private void restoreState(Window window) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(true);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            }
        }

        window.getDecorView().setSystemUiVisibility(previousSystemUiVisibility);
        window.setStatusBarColor(previousStatusBarColor);
        window.setNavigationBarColor(previousNavigationBarColor);
        savedState = false;
    }
}
