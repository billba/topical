const { MemoryStorage, ConsoleAdapter } = require('botbuilder');
const { Topic, prettyConsole, consoleOnTurn, doTopic, hasNumber } = require ('../lib/src/topical.js');

class Echo extends Topic {

    async onStart(args) {
        await this.send(`Welcome to the child topic! Say 'end child' to go back to the root.`);
    }

    async onDispatch() {
        if (this.text === 'end child')
            await this.end();
        else
            await this.send(`Child Topic: you said "${this.text}"`);
    }
}
Echo.register();

class RootTopic extends Topic {

    async help() {
        await this.send(`Try "start child" or "time".`);
    }

    async onStart() {
        await this.send(`Welcome to my root topic!`);
        await this.help();
    }
    
    async onDispatch() {
        if (!this.text)
            return;

        if (this.text.includes('time')) {
            await this.send(`The current time is ${new Date().toLocaleTimeString()}`);
            return;
        }

        if (await this.dispatchToChild())
            return;

        if (this.text === 'start child') {
            return this.startChild(Echo);
        }

        await this.help();
    }

    async onChildReturn() {
        await this.send(`Welcome back from the child topic!`);
        await this.help();
    }
}
RootTopic.register();


Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter()
    .use(prettyConsole);

consoleOnTurn(adapter, context => doTopic(RootTopic, context));
