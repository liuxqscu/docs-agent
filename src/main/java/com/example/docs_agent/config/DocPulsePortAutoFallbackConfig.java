package com.example.docs_agent.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.web.server.ConfigurableWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.net.InetSocketAddress;
import java.net.ServerSocket;

/**
 * DocPulse 端口自适应配置。
 * 当配置端口被占用时，自动在指定范围内探测可用端口，降低本地应用启动冲突概率。
 */
@Slf4j
@Component
public class DocPulsePortAutoFallbackConfig implements WebServerFactoryCustomizer<ConfigurableWebServerFactory> {

    @Value("${server.port:18080}")
    private int preferredPort;

    @Value("${docpulse.server.port.auto-fallback:false}")
    private boolean autoFallbackEnabled;

    @Value("${docpulse.server.port.max-offset:50}")
    private int maxOffset;

    @Override
    public void customize(ConfigurableWebServerFactory factory) {
        if (!autoFallbackEnabled || preferredPort <= 0) {
            return;
        }

        int resolvedPort = findAvailablePort(preferredPort, Math.max(0, maxOffset));
        if (resolvedPort != preferredPort) {
            log.warn("配置端口 {} 被占用，DocPulse 自动切换到可用端口 {}", preferredPort, resolvedPort);
        }

        factory.setPort(resolvedPort);
    }

    @EventListener
    public void onApplicationReady(ApplicationReadyEvent event) {
        Environment environment = event.getApplicationContext().getEnvironment();
        String actualPort = environment.getProperty("local.server.port");
        if (actualPort != null) {
            log.info("DocPulse 服务已启动：https://localhost:{}", actualPort);
        }
    }

    private int findAvailablePort(int startPort, int offsetLimit) {
        for (int candidate = startPort; candidate <= startPort + offsetLimit; candidate++) {
            if (isPortAvailable(candidate)) {
                return candidate;
            }
        }
        return startPort;
    }

    private boolean isPortAvailable(int port) {
        try (ServerSocket socket = new ServerSocket()) {
            socket.setReuseAddress(false);
            socket.bind(new InetSocketAddress(port));
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
}
