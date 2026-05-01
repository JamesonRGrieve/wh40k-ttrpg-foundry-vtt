type TourStepExtras = {
    selector: string;
    action?: 'click' | 'scrollTo';
    target?: string;
};

type TourStatus = 'completed' | string;

export class WH40KTour extends foundry.nue.Tour {
    //This class overcharge the "step" data structure with the following properties:
    // - action: "click" or "scrollTo"
    // - target: CSS selector of the element to use for the action. If not set, the selector is used for the action
    triggerReset = false;

    protected get currentWh40KStep(): foundry.nue.Tour.Step & TourStepExtras {
        return this.currentStep as foundry.nue.Tour.Step & TourStepExtras;
    }

    /**
     * Wait for an element to exists in the DOM then resolves the promise
     * @param {string} selector CSS selector of the element to wait for
     * @returns {Promise<void>}
     */
    async waitForElement(selector: string): Promise<void> {
        return new Promise<void>((resolve) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve();
                return;
            }

            const mutationObserver = new MutationObserver((_mutations, obs) => {
                document.querySelectorAll(selector).forEach(() => {
                    resolve();
                    obs.disconnect();
                });
            });

            mutationObserver.observe(document.body, {
                childList: true,
                subtree: true,
            });
        });
    }

    async _preStep() {
        await super._preStep();
        await this.waitForElement(this.currentWh40KStep.selector);
    }

    async _postStep() {
        await super._postStep();
        const stepIndex = this.stepIndex ?? -1;
        if (stepIndex < 0 || !this.hasNext) return;

        if (!this.currentWh40KStep.action) return;

        if (this.triggerReset) {
            this.triggerReset = false;
            return;
        }
        const target = this.currentWh40KStep.target ? this.currentWh40KStep.target : this.currentWh40KStep.selector;
        const element = document.querySelector<HTMLElement>(target);
        if (!element) return;
        switch (this.currentWh40KStep.action) {
            case 'click':
                element.click();
                break;
            case 'scrollTo':
                element.scrollIntoView({ block: 'start', inline: 'nearest' });
                break;
        }
    }

    /**
     * Detect when a reset is triggered and stop the actions in _postStep
     */
    async reset() {
        if ((this.status as TourStatus) !== 'completed') this.triggerReset = true;
        await super.reset();
    }
}
