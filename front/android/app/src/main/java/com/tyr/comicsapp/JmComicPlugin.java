package com.tyr.comicsapp;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "JmComic")
public class JmComicPlugin extends Plugin {
    @PluginMethod
    public void probe(PluginCall call) {
        try {
            if (!Python.isStarted()) {
                Python.start(new AndroidPlatform(getContext()));
            }

            PyObject module = Python.getInstance().getModule("jmcomic");
            JSObject result = new JSObject();
            result.put("available", true);
            result.put("version", String.valueOf(module.get("__version__")));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("JM runtime unavailable: " + error.getMessage(), error);
        }
    }
}
