const { MemoryStorage, ConsoleAdapter } = require('botbuilder');
const { Topic, prettyConsole, consoleOnTurn, doTopic } = require ('../lib/src/topical.js');

class ChildTopic extends Topic {

    async onStart(args) {
        await this.send(`Welcome to the child topic!\nWhat multiple of ${args["foo"]} do you want to return?`);
    }

    async onDispatch() {
        const num = Number.parseInt(this.text);

        if (Number.isNaN(num))
            await this.send(`Please supply a number.`);
        else
            return this.end({
                num
            });
    }
}
ChildTopic.register();

class RootTopic extends Topic {

    async onStart() {
        await this.send(`Welcome to my root topic!`);
    }
    
    async onDispatch() {
        if (this.text === 'end child') {
            if (this.hasChild()) {
                this.clearChild();
                await this.send(`I have ended the child topic.`);
            } else {
                await this.send(`There is no child to end`);
            }
            return;
        }

        if (await this.dispatchToChild())
            return;

        if (this.text === 'start child') {
            return this.startChild(ChildTopic, {
                foo: 13
            });
        }

        await this.send(`Try "start child" or "end child".`);
    }

    async onChildReturn(child)
    {
        await this.send(`13 * ${child.return.num} = ${13 * child.return.num}`);
        this.clearChild();
    }
}
RootTopic.register();


Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter()
    .use(prettyConsole);

consoleOnTurn(adapter, context => doTopic(RootTopic, context));
