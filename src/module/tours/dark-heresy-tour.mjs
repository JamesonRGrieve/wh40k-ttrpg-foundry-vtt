export class DarkHeresyTour extends Tour {
    //This class overcharge the "step" data structure with the following properties:
    // - action: "click" or "scrollTo"
    // - target: CSS selector of the element to use for the action. If not set, the selector is used for the action

    /**
     * Wait for an element to exists in the DOM then resolves the promise
     * @param {string} selector CSS selector of the element to wait for
     * @returns {Promise<void>}
     */
    async waitForElement(selector) {
        return new Promise((resolve, reject) => {
            let element = document.querySelector(selector);
            if (element) {
                resolve();
                return;
            }

            const observer = new MutationObserver((mutations, observer) => {
                document.querySelectorAll(selector).forEach((el) => {
                    resolve(el);
                    observer.disconnect();
                });
            })

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }

    async _preStep() {
        await super._preStep();
        await this.waitForElement(this.currentStep.selector);
    }

    async _postStep() {
        await super._postStep();
        if (this.stepIndex < 0 || !this.hasNext)
            return;

        if (!this.currentStep.action)
            return;

        if(this.triggerReset) {
            this.triggerReset = false;
            return;
        }
        let target = this.currentStep.target ? this.currentStep.target : this.currentStep.selector;
        switch (this.currentStep.action) {
            case "click":
                document.querySelector(target).click();
                break;
            case "scrollTo":
                document.querySelector(target).scrollIntoView({ block: "start", inline: "nearest" });
                break;
        }
    }

    /**
     * Detect when a reset is triggered and stop the actions in _postStep
     */
    async reset() {
        if(this.status != "completed")
            this.triggerReset = true;
        await super.reset();
    }
}
