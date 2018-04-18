import { MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, prettyConsole, Waterfall } from '../src/topical';

Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter();

adapter
    .use(prettyConsole)
    .listen(async context => {
        await Root.do(context);
    });

class KnockKnock extends Waterfall  {

    async onBegin() {
        await this.onTurn();
    }

    async onTurn() {
    
        this.waterfall(
            async () => {
                await this.context.sendActivity(`Who's there?`);
            },
            async (next) => {
                if (this.text === 'cheat') {
                    next();
                    return;
                }
                await this.context.sendActivity(`${this.text} who?`);
            },
            async () => {
                await this.context.sendActivity(`Hilarious!`)
            },
        )
    }
}

class Root extends Topic {

    static subtopics = [KnockKnock];

    async onBegin() {
        await this.context.sendActivity(`Tell me a knock knock joke`);
    }

    async onTurn() {
        if (await this.dispatchToChild())
            return;

        if (this.text === 'knock knock')
            await this.beginChild(KnockKnock);
    }
}