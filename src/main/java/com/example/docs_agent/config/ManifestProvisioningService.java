package com.example.docs_agent.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Ensures a local Word add-in manifest exists for the current user.
 * The file is generated under user home to avoid requiring admin privileges.
 */
@Slf4j
@Component
public class ManifestProvisioningService {

    private static final String MANIFEST_FILE_NAME = "DocPulse-manifest.xml";
    private static final String ADDIN_ID = "d35bc23b-017e-469b-b0b3-1f148b3c6601";

    private final Environment environment;
    private volatile boolean generatedThisRun;

    public ManifestProvisioningService(Environment environment) {
        this.environment = environment;
    }

    @EventListener
    public void ensureManifestOnStartup(ApplicationReadyEvent event) {
        Path manifestPath = getManifestPath();
        String manifestContent = buildManifestContent();

        try {
            Files.createDirectories(manifestPath.getParent());
            if (!Files.exists(manifestPath)) {
                Files.writeString(manifestPath, manifestContent, StandardCharsets.UTF_8);
                generatedThisRun = true;
                log.info("Word manifest generated: {}", manifestPath);
            } else {
                String existing = Files.readString(manifestPath, StandardCharsets.UTF_8);
                if (!existing.equals(manifestContent)) {
                    Files.writeString(manifestPath, manifestContent, StandardCharsets.UTF_8);
                    log.info("Word manifest updated: {}", manifestPath);
                } else {
                    log.info("Word manifest already up to date: {}", manifestPath);
                }
            }

            log.info("Word manifest SourceLocation: {}", getManifestWebUrl());
        } catch (IOException ex) {
            log.warn("Failed to prepare Word manifest file: {}", manifestPath, ex);
        }
    }

    public Path getManifestPath() {
        return Paths.get(System.getProperty("user.home"), ".docsagent", "manifest", MANIFEST_FILE_NAME);
    }

    public String getManifestWebUrl() {
        String port = environment.getProperty("local.server.port", environment.getProperty("server.port", "18080"));
        return "https://localhost:" + port + "/index.html";
    }

    public boolean manifestExists() {
        return Files.exists(getManifestPath());
    }

    public boolean isGeneratedThisRun() {
        return generatedThisRun;
    }

    private String buildManifestContent() {
        String sourceLocation = getManifestWebUrl();
        String appDomain = sourceLocation.replace("/index.html", "");

        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            + "<OfficeApp xmlns=\"http://schemas.microsoft.com/office/appforoffice/1.1\"\n"
            + "           xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"\n"
            + "           xsi:type=\"TaskPaneApp\">\n"
            + "  <Id>" + ADDIN_ID + "</Id>\n"
            + "  <Version>1.0.0.0</Version>\n"
            + "  <ProviderName>DocPulse</ProviderName>\n"
            + "  <DefaultLocale>zh-CN</DefaultLocale>\n"
            + "  <DisplayName DefaultValue=\"DocPulse\"/>\n"
            + "  <Description DefaultValue=\"在侧边栏像写代码一样编辑 Word\"/>\n"
            + "  <Hosts>\n"
            + "    <Host Name=\"Document\"/>\n"
            + "  </Hosts>\n"
            + "  <DefaultSettings>\n"
            + "    <SourceLocation DefaultValue=\"" + sourceLocation + "\"/>\n"
            + "  </DefaultSettings>\n"
            + "  <AppDomains>\n"
            + "    <AppDomain>" + appDomain + "</AppDomain>\n"
            + "  </AppDomains>\n"
            + "  <Permissions>ReadWriteDocument</Permissions>\n"
            + "</OfficeApp>\n";
    }
}
