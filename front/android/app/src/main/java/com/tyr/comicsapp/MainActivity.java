package com.tyr.comicsapp;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(LocalFolderPlugin.class);
        registerPlugin(ArchivePlugin.class);
        registerPlugin(DownloadTargetPlugin.class);
        registerPlugin(WebDavPlugin.class);
        registerPlugin(JmComicPlugin.class);
        registerPlugin(NativeHttpPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
