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
                export ARCHIVE_NAME=`cd archive && echo *`
                cp ./archive/* ${'$'}JB_SPACE_FILE_SHARE_PATH
            """.trimIndent()
        }
    }

    container("alpine/curl") {
        shellScript {
            content = """
                echo Uploading artifacts
                ARCHIVE_NAME=`cd ${'$'}JB_SPACE_FILE_SHARE_PATH && echo *`
                SOURCE_PATH=${'$'}JB_SPACE_FILE_SHARE_PATH/${'$'}ARCHIVE_NAME
                TARGET_PATH=${'$'}JB_SPACE_EXECUTION_NUMBER/
                REPO_URL=https://files.pkg.jetbrains.space/keathley/p/dark-heresy-foundry-module/releases
                curl -i -H "Authorization: Bearer ${'$'}JB_SPACE_CLIENT_TOKEN" -F file=@"${'$'}SOURCE_PATH" ${'$'}REPO_URL/${'$'}TARGET_PATH
            """.trimIndent()
        }
    }

    failOn {
        testFailed { enabled = true }
        nonZeroExitCode { enabled = true }
        outOfMemory { enabled = true }
        timeOut { runningTimeOutInMinutes = 15 }
    }
}


