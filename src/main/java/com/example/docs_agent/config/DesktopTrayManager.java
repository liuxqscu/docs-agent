package com.example.docs_agent.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;

import java.awt.AWTException;
import java.awt.Color;
import java.awt.Desktop;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.GridLayout;
import java.awt.MenuItem;
import java.awt.PopupMenu;
import java.awt.SystemTray;
import java.awt.TrayIcon;
import java.awt.image.BufferedImage;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import javax.swing.JButton;
import javax.swing.JFrame;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.SwingUtilities;
import javax.swing.WindowConstants;

/**
 * Desktop tray integration for local desktop usage.
 * Users can start DocPulse by double-clicking the app and exit from tray menu.
 */
@Slf4j
@Component
public class DesktopTrayManager {

    private final ConfigurableApplicationContext applicationContext;
    private final Environment environment;
    private final ManifestProvisioningService manifestProvisioningService;
    private TrayIcon trayIcon;
    private JFrame fallbackControlFrame;

    public DesktopTrayManager(ConfigurableApplicationContext applicationContext,
                              Environment environment,
                              ManifestProvisioningService manifestProvisioningService) {
        this.applicationContext = applicationContext;
        this.environment = environment;
        this.manifestProvisioningService = manifestProvisioningService;
    }

    @EventListener
    public void onApplicationReady(ApplicationReadyEvent event) {
        tryInstallTrayIcon();
    }

    @EventListener
    public void onContextClosed(ContextClosedEvent event) {
        if (trayIcon != null && SystemTray.isSupported()) {
            SystemTray.getSystemTray().remove(trayIcon);
            trayIcon = null;
        }
    }

    private void tryInstallTrayIcon() {
        if (!SystemTray.isSupported()) {
            log.info("System tray not supported, skip desktop tray integration.");
            showFallbackControlWindow();
            return;
        }

        if (trayIcon != null) {
            return;
        }

        try {
            PopupMenu popupMenu = new PopupMenu();

            MenuItem openWebItem = new MenuItem("Open DocPulse");
            openWebItem.addActionListener(e -> openLocalWeb());
            popupMenu.add(openWebItem);

            MenuItem statusItem = new MenuItem("Show Status");
            statusItem.addActionListener(e -> showStatusMessage());
            popupMenu.add(statusItem);

            MenuItem openManifestDirItem = new MenuItem("Open Manifest Folder");
            openManifestDirItem.addActionListener(e -> openManifestDirectory());
            popupMenu.add(openManifestDirItem);

            popupMenu.addSeparator();

            MenuItem exitItem = new MenuItem("Exit DocPulse");
            exitItem.addActionListener(e -> {
                log.info("Exit requested from system tray.");
                applicationContext.close();
                System.exit(0);
            });
            popupMenu.add(exitItem);

            trayIcon = new TrayIcon(createTrayImage(), "DocPulse", popupMenu);
            trayIcon.setImageAutoSize(true);
            trayIcon.addActionListener(e -> openLocalWeb());

            SystemTray.getSystemTray().add(trayIcon);
            String startupMessage = "DocPulse is running. Right-click tray icon to exit.";
            if (manifestProvisioningService.isGeneratedThisRun()) {
                startupMessage = startupMessage + "\nWord manifest has been generated automatically.";
            }
            trayIcon.displayMessage("DocPulse", startupMessage, TrayIcon.MessageType.INFO);
            log.info("System tray icon initialized.");
        } catch (AWTException ex) {
            log.warn("Failed to initialize system tray icon.", ex);
        }
    }

    private void showFallbackControlWindow() {
        SwingUtilities.invokeLater(() -> {
            if (fallbackControlFrame != null) {
                fallbackControlFrame.setVisible(true);
                fallbackControlFrame.toFront();
                return;
            }

            JFrame frame = new JFrame("DocPulse Control Center");
            frame.setDefaultCloseOperation(WindowConstants.HIDE_ON_CLOSE);

            JPanel panel = new JPanel(new GridLayout(0, 1, 8, 8));

            JButton openButton = new JButton("Open DocPulse");
            openButton.addActionListener(e -> openLocalWeb());
            panel.add(openButton);

            JButton statusButton = new JButton("Show Status");
            statusButton.addActionListener(e -> showStatusMessage());
            panel.add(statusButton);

            JButton manifestButton = new JButton("Open Manifest Folder");
            manifestButton.addActionListener(e -> openManifestDirectory());
            panel.add(manifestButton);

            JButton exitButton = new JButton("Exit DocPulse");
            exitButton.addActionListener(e -> {
                applicationContext.close();
                System.exit(0);
            });
            panel.add(exitButton);

            frame.getContentPane().add(panel);
            frame.pack();
            frame.setLocationRelativeTo(null);
            frame.setVisible(true);
            fallbackControlFrame = frame;
        });
    }

    private void openLocalWeb() {
        if (!Desktop.isDesktopSupported()) {
            return;
        }

        String port = environment.getProperty("local.server.port", "18080");
        String url = "https://localhost:" + port;

        try {
            Desktop.getDesktop().browse(new URI(url));
        } catch (Exception ex) {
            log.warn("Failed to open browser for {}", url, ex);
        }
    }

    private void showStatusMessage() {
        String port = environment.getProperty("local.server.port", "18080");
        String url = "https://localhost:" + port;
        String manifestUrl = manifestProvisioningService.getManifestWebUrl();
        String manifestPath = manifestProvisioningService.getManifestPath().toString();
        Path certPath = resolveCertPath();
        String certInfo = certPath != null
            ? (Files.exists(certPath) ? "Certificate OK" : "Certificate missing")
            : "Certificate path unavailable";
        String manifestInfo = manifestProvisioningService.manifestExists() ? "Manifest ready" : "Manifest missing";

        String detail = "Port " + port + " | " + certInfo + " | " + manifestInfo;
        String message = detail + "\nService URL: " + url + "\nManifest URL: " + manifestUrl + "\nManifest file: " + manifestPath;

        if (trayIcon != null) {
            trayIcon.displayMessage("DocPulse Status", message, TrayIcon.MessageType.NONE);
        } else {
            JOptionPane.showMessageDialog(fallbackControlFrame, message, "DocPulse Status", JOptionPane.INFORMATION_MESSAGE);
        }
    }

    private void openManifestDirectory() {
        if (!Desktop.isDesktopSupported()) {
            return;
        }

        try {
            Path manifestDir = manifestProvisioningService.getManifestPath().getParent();
            if (manifestDir != null && Files.exists(manifestDir)) {
                Desktop.getDesktop().open(manifestDir.toFile());
            }
        } catch (Exception ex) {
            log.warn("Failed to open manifest directory.", ex);
        }
    }

    private Path resolveCertPath() {
        String keyStore = environment.getProperty("server.ssl.key-store");
        if (keyStore == null || keyStore.isBlank()) {
            return null;
        }

        try {
            if (keyStore.startsWith("file:")) {
                return Paths.get(URI.create(keyStore));
            }
            return Paths.get(keyStore);
        } catch (Exception ex) {
            log.debug("Unable to resolve keystore path from {}", keyStore, ex);
            return null;
        }
    }

    private Image createTrayImage() {
        BufferedImage image = new BufferedImage(16, 16, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g2 = image.createGraphics();

        g2.setColor(new Color(37, 99, 235));
        g2.fillRoundRect(0, 0, 16, 16, 6, 6);

        g2.setColor(Color.WHITE);
        g2.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 9));
        g2.drawString("D", 4, 11);

        g2.dispose();
        return image;
    }
}
