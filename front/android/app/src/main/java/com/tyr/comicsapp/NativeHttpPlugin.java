package com.tyr.comicsapp;

import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

@CapacitorPlugin(name = "NativeHttp")
public class NativeHttpPlugin extends Plugin {
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final OkHttpClient client = new OkHttpClient.Builder()
        .followRedirects(true)
        .followSslRedirects(true)
        .build();

    @PluginMethod
    public void request(PluginCall call) {
        String url = call.getString("url");
        String method = call.getString("method", "GET").toUpperCase();
        String body = call.getString("body", "");
        String responseType = call.getString("responseType", "text");
        JSObject headers = call.getObject("headers");
        if (headers == null) {
            headers = new JSObject();
        }

        if (url == null || url.isEmpty()) {
            call.reject("缺少请求地址");
            return;
        }

        executor.execute(() -> {
            try {
                Request request = buildRequest(url, method, body, headers);
                try (Response response = client.newCall(request).execute()) {
                    ResponseBody responseBody = response.body();
                    String mimeType = responseBody == null || responseBody.contentType() == null
                        ? "application/octet-stream"
                        : responseBody.contentType().toString();

                    JSObject result = new JSObject();
                    result.put("status", response.code());
                    result.put("mimeType", mimeType);
                    result.put("url", response.request().url().toString());

                    if ("head".equalsIgnoreCase(responseType) || "HEAD".equals(method)) {
                        result.put("data", "");
                    } else if ("base64".equalsIgnoreCase(responseType)) {
                        byte[] bytes = responseBody == null ? new byte[0] : responseBody.bytes();
                        result.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                    } else {
                        result.put("data", responseBody == null ? "" : responseBody.string());
                    }

                    resolveOnMain(call, result);
                }
            } catch (IOException error) {
                rejectOnMain(call, error.getMessage() == null ? "网络请求失败" : error.getMessage());
            } catch (Exception error) {
                rejectOnMain(call, error.getMessage() == null ? "请求参数错误" : error.getMessage());
            }
        });
    }

    private Request buildRequest(String url, String method, String body, JSObject headers) {
        Request.Builder builder = new Request.Builder()
            .url(url)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
            .header("Accept-Language", "en,zh-CN;q=0.9,zh;q=0.8")
            .header("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36");

        Iterator<String> keys = headers.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            String value = headers.optString(key, "");
            if (!key.isEmpty() && !value.isEmpty()) {
                builder.header(key, value);
            }
        }

        if ("POST".equals(method)) {
            String contentType = headers.optString("Content-Type", "application/x-www-form-urlencoded");
            builder.method(method, RequestBody.create(body, MediaType.parse(contentType)));
        } else if ("HEAD".equals(method)) {
            builder.head();
        } else {
            builder.get();
        }

        return builder.build();
    }

    private void resolveOnMain(PluginCall call, JSObject response) {
        getActivity().runOnUiThread(() -> call.resolve(response));
    }

    private void rejectOnMain(PluginCall call, String message) {
        getActivity().runOnUiThread(() -> call.reject(message));
    }
}
