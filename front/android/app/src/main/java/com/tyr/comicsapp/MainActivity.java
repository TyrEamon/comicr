package com.tyr.comicsapp;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(LocalFolderPlugin.class);
        registerPlugin(WebDavPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
