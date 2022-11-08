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

job("Package Release") {
    startOn {
        gitPush {
            // run only if there's a release tag
            // e.g., release/v1.0.0
            tagFilter {
                +"release/*"
            }
        }
    }

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

    container(displayName = "Space Deploy", image ="alpine/curl") {
        shellScript {
            content = """
                echo Uploading artifacts
                ARCHIVE_NAME=`cd ${'$'}JB_SPACE_FILE_SHARE_PATH && echo *`
                SOURCE_PATH=${'$'}JB_SPACE_FILE_SHARE_PATH/${'$'}ARCHIVE_NAME
                REPO_URL=https://files.pkg.jetbrains.space/keathley/p/dark-heresy-foundry-module/releases
                curl -i -H "Authorization: Bearer ${'$'}JB_SPACE_CLIENT_TOKEN" -F file=@"${'$'}SOURCE_PATH" ${'$'}REPO_URL/
            """.trimIndent()
        }
    }
}

job("Build and Deploy") {
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

    container(displayName = "Foundry Deploy", image ="buildo/alpine-ssh") {
        env["RSA_KEY"] = Secrets("jb-space-id-rsa")

        shellScript {
            content = """
                echo Deploying to Foundry
                
                ARCHIVE_NAME=`cd ${'$'}JB_SPACE_FILE_SHARE_PATH && echo *`
                SOURCE_PATH=${'$'}JB_SPACE_FILE_SHARE_PATH/${'$'}ARCHIVE_NAME
                
                echo Setting up rsa key
                echo ${'$'}RSA_KEY | sed 's/\\n/\n/g' > id_rsa
                chmod 600 id_rsa
                
                echo SCP Archive
                scp -o StrictHostKeyChecking=no -i id_rsa ${'$'}SOURCE_PATH root@foundry.keathley.co:/home/foundry/foundryuserdata/Data/systems
                
                echo Inflate Archive
                ssh -o StrictHostKeyChecking=no -i id_rsa root@foundry.keathley.co "cd /home/foundry/foundryuserdata/Data/systems; unzip -o ${'$'}ARCHIVE_NAME -d dark-heresy-2nd/; rm -f ${'$'}ARCHIVE_NAME"
                
                echo Deployed
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


