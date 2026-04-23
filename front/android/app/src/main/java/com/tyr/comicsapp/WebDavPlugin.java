package com.tyr.comicsapp;

import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

@CapacitorPlugin(name = "WebDav")
public class WebDavPlugin extends Plugin {
    private static final MediaType XML_MEDIA_TYPE = MediaType.parse("application/xml; charset=utf-8");

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final OkHttpClient client = new OkHttpClient.Builder()
        .followRedirects(true)
        .followSslRedirects(true)
        .build();

    @PluginMethod
    public void propfind(PluginCall call) {
        String url = call.getString("url");
        String authorization = call.getString("authorization", "");
        String depth = call.getString("depth", "1");
        String body = call.getString("body", "");
        JSObject proxy = call.getObject("proxy");
        final JSObject requestProxy = proxy == null ? new JSObject() : proxy;

        if (url == null || url.isEmpty()) {
            call.reject("缺少 WebDAV 地址");
            return;
        }

        executor.execute(() -> {
            OkHttpClient requestClient = ProxySettings.apply(client, requestProxy);
            Request request = new Request.Builder()
                .url(url)
                .method("PROPFIND", RequestBody.create(body, XML_MEDIA_TYPE))
                .header("Depth", depth)
                .header("Content-Type", "application/xml; charset=utf-8")
                .header("Authorization", authorization)
                .build();

            try (Response response = requestClient.newCall(request).execute()) {
                JSObject result = new JSObject();
                result.put("status", response.code());
                result.put("data", response.body() == null ? "" : response.body().string());
                resolveOnMain(call, result);
            } catch (IOException error) {
                rejectOnMain(call, error.getMessage() == null ? "WebDAV 请求失败" : error.getMessage());
            }
        });
    }

    @PluginMethod
    public void getFile(PluginCall call) {
        String url = call.getString("url");
        String authorization = call.getString("authorization", "");
        JSObject proxy = call.getObject("proxy");
        final JSObject requestProxy = proxy == null ? new JSObject() : proxy;

        if (url == null || url.isEmpty()) {
            call.reject("缺少 WebDAV 文件地址");
            return;
        }

        executor.execute(() -> {
            OkHttpClient requestClient = ProxySettings.apply(client, requestProxy);
            Request request = new Request.Builder()
                .url(url)
                .get()
                .header("Authorization", authorization)
                .build();

            try (Response response = requestClient.newCall(request).execute()) {
                ResponseBody body = response.body();
                byte[] bytes = body == null ? new byte[0] : body.bytes();
                String mimeType = body == null || body.contentType() == null
                    ? "application/octet-stream"
                    : body.contentType().toString();

                JSObject result = new JSObject();
                result.put("status", response.code());
                result.put("mimeType", mimeType);
                result.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                resolveOnMain(call, result);
            } catch (IOException error) {
                rejectOnMain(call, error.getMessage() == null ? "WebDAV 文件下载失败" : error.getMessage());
            }
        });
    }

    private void resolveOnMain(PluginCall call, JSObject response) {
        getActivity().runOnUiThread(() -> call.resolve(response));
    }

    private void rejectOnMain(PluginCall call, String message) {
        getActivity().runOnUiThread(() -> call.reject(message));
    }
}
