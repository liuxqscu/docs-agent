package com.example.docs_agent.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.web.server.ConfigurableWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/**
 * Auto-provisions local SSL certificate before web server startup.
 * This enables first-run experience without manually preparing keystore.
 */
@Slf4j
@Component
public class LocalCertificateProvisioningConfig implements WebServerFactoryCustomizer<ConfigurableWebServerFactory> {

    private static final String CERT_ALIAS = "docpulse-localhost";

    private final Environment environment;

    public LocalCertificateProvisioningConfig(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void customize(ConfigurableWebServerFactory factory) {
        if (!isSslEnabled()) {
            return;
        }

        Path keyStorePath = resolveKeyStorePath();
        if (keyStorePath == null) {
            log.warn("Skip local certificate provisioning: unresolved keystore path.");
            return;
        }

        if (Files.exists(keyStorePath)) {
            return;
        }

        String storePassword = environment.getProperty("server.ssl.key-store-password", "123456");

        try {
            Files.createDirectories(keyStorePath.getParent());
            createKeyStoreWithKeytool(keyStorePath, storePassword);
            Path certPath = exportCertificateWithKeytool(keyStorePath, storePassword);
            importToTrustedRootIfSupported(certPath);
            log.info("Local certificate generated for DocPulse: {}", keyStorePath);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to auto-generate local SSL certificate: " + keyStorePath, ex);
        }
    }

    private boolean isSslEnabled() {
        return Boolean.parseBoolean(environment.getProperty("server.ssl.enabled", "false"));
    }

    private Path resolveKeyStorePath() {
        String keyStore = environment.getProperty("server.ssl.key-store");
        if (keyStore == null || keyStore.isBlank()) {
            return null;
        }

        if (keyStore.startsWith("file:")) {
            keyStore = keyStore.substring("file:".length());
        }

        keyStore = keyStore.replace("${user.home}", System.getProperty("user.home"));
        return Paths.get(keyStore).toAbsolutePath().normalize();
    }

    private void createKeyStoreWithKeytool(Path keyStorePath, String storePassword) throws IOException, InterruptedException {
        List<String> command = new ArrayList<>();
        command.add(resolveKeytoolExecutable());
        command.add("-genkeypair");
        command.add("-alias");
        command.add(CERT_ALIAS);
        command.add("-keyalg");
        command.add("RSA");
        command.add("-keysize");
        command.add("2048");
        command.add("-validity");
        command.add("3650");
        command.add("-storetype");
        command.add("PKCS12");
        command.add("-keystore");
        command.add(keyStorePath.toString());
        command.add("-storepass");
        command.add(storePassword);
        command.add("-keypass");
        command.add(storePassword);
        command.add("-dname");
        command.add("CN=localhost, OU=DocPulse, O=DocPulse, L=Local, ST=Local, C=CN");
        command.add("-ext");
        command.add("SAN=dns:localhost,ip:127.0.0.1");
        command.add("-noprompt");

        runProcess(command, "keytool generate keystore");
    }

    private Path exportCertificateWithKeytool(Path keyStorePath, String storePassword) throws IOException, InterruptedException {
        Path certPath = keyStorePath.getParent().resolve("docpulse-localhost.cer");

        List<String> command = new ArrayList<>();
        command.add(resolveKeytoolExecutable());
        command.add("-exportcert");
        command.add("-alias");
        command.add(CERT_ALIAS);
        command.add("-keystore");
        command.add(keyStorePath.toString());
        command.add("-storepass");
        command.add(storePassword);
        command.add("-rfc");
        command.add("-file");
        command.add(certPath.toString());

        runProcess(command, "keytool export certificate");
        return certPath;
    }

    private void importToTrustedRootIfSupported(Path certPath) {
        String os = System.getProperty("os.name", "").toLowerCase();
        if (!os.contains("win")) {
            log.info("Skip system trust import on non-Windows OS. Certificate file: {}", certPath);
            return;
        }

        try {
            List<String> command = List.of("certutil", "-addstore", "-f", "Root", certPath.toString());
            runProcess(command, "certutil import root certificate");
            log.info("Certificate imported to Windows trusted root store.");
        } catch (Exception ex) {
            log.warn("Unable to import certificate into Windows trusted root store. Run with administrator permission if needed.", ex);
        }
    }

    private void runProcess(List<String> command, String action) throws IOException, InterruptedException {
        ProcessBuilder builder = new ProcessBuilder(command);
        builder.redirectErrorStream(true);
        Process process = builder.start();
        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new IllegalStateException(action + " failed with exit code " + exitCode);
        }
    }

    private String resolveKeytoolExecutable() {
        String javaHome = System.getProperty("java.home");
        if (javaHome != null && !javaHome.isBlank()) {
            Path candidate = Paths.get(javaHome, "bin", isWindows() ? "keytool.exe" : "keytool");
            if (Files.exists(candidate)) {
                return candidate.toString();
            }
        }
        return isWindows() ? "keytool.exe" : "keytool";
    }

    private boolean isWindows() {
        return File.separatorChar == '\\';
    }
}
