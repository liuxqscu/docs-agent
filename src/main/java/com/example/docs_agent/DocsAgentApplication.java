package com.example.docs_agent;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DocsAgentApplication {
	public static void main(String[] args) {
		System.setProperty("java.awt.headless", "false");
		SpringApplication application = new SpringApplication(DocsAgentApplication.class);
		application.setHeadless(false);
		application.run(args);
	}
}