/**
* JetBrains Space Automation
* This Kotlin-script file lets you automate build activities
* For more info, see https://www.jetbrains.com/help/space/automation.html
*/

job("Run NPM Build") {
    container(displayName = "NPM Build", image = "node:14-alpine") {
    	shellScript {
        	interpreter = "/bin/sh"
            content = """
            	echo Install npm dependencies...
                npm install
                echo Run Build
                npm run build
            """
        }
    }
    container("openjdk:11") {
        kotlinScript { api ->
            api.space().projects.automation.deployments.start(
                project = api.projectIdentifier(),
                targetIdentifier = TargetIdentifier.Key("foundry"),
                version = "1.0.0",
                // automatically update deployment status based on a status of a job
                syncWithAutomationJob = true
            )
        }
    }
}
