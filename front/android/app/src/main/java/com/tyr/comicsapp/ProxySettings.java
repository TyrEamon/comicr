package com.tyr.comicsapp;

import com.getcapacitor.JSObject;

import java.net.InetSocketAddress;
import java.net.PasswordAuthentication;
import java.net.Proxy;
import java.util.Locale;

import okhttp3.Credentials;
import okhttp3.OkHttpClient;

public final class ProxySettings {
    private ProxySettings() {}

    public static OkHttpClient apply(OkHttpClient client, JSObject config) {
        if (config == null || !config.optBoolean("enabled", false)) {
            return client;
        }

        String host = config.optString("host", "").trim();
        int port = config.optInt("port", 0);
        if (host.isEmpty() || port <= 0 || port > 65535) {
            return client;
        }

        String type = config.optString("type", "socks5").toLowerCase(Locale.ROOT);
        Proxy.Type proxyType = "http".equals(type) ? Proxy.Type.HTTP : Proxy.Type.SOCKS;
        String username = config.optString("username", "").trim();
        String password = config.optString("password", "");

        OkHttpClient.Builder builder = client.newBuilder()
            .proxy(new Proxy(proxyType, new InetSocketAddress(host, port)));

        if (!username.isEmpty() || !password.isEmpty()) {
            if (proxyType == Proxy.Type.HTTP) {
                String credential = Credentials.basic(username, password);
                builder.proxyAuthenticator((route, response) -> response.request()
                    .newBuilder()
                    .header("Proxy-Authorization", credential)
                    .build());
            } else {
                installSocksAuthenticator(username, password);
            }
        } else if (proxyType == Proxy.Type.SOCKS) {
            clearSocksAuthenticator();
        }

        return builder.build();
    }

    private static void installSocksAuthenticator(String username, String password) {
        System.setProperty("java.net.socks.username", username);
        System.setProperty("java.net.socks.password", password);
        java.net.Authenticator.setDefault(new java.net.Authenticator() {
            @Override
            protected PasswordAuthentication getPasswordAuthentication() {
                if (getRequestorType() == RequestorType.PROXY) {
                    return new PasswordAuthentication(username, password.toCharArray());
                }
                return null;
            }
        });
    }

    private static void clearSocksAuthenticator() {
        System.clearProperty("java.net.socks.username");
        System.clearProperty("java.net.socks.password");
        java.net.Authenticator.setDefault(null);
    }
}
