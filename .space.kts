/**
* JetBrains Space Automation
* This Kotlin-script file lets you automate build activities
* For more info, see https://www.jetbrains.com/help/space/automation.html
*/

job("Env Warmup") {
	startOn {
    	schedule { cron("0 7 * * *") }
    }
    warmup(ide = Ide.Idea) {}
    git {
    	depth = UNLIMITED_DEPTH
        refSpec = "refs/*:refs/*"
    }
}

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
        
        failOn {
            testFailed { enabled = true }
        	nonZeroExitCode { enabled = true }
            outOfMemory { enabled = true }
            timeOut { runningTimeOutInMinutes = 15 }
        }
    }
}


