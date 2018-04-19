import { MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, prettyConsole } from '../src/topical';

Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter();

adapter
    .use(prettyConsole)
    .listen(async context => {
        await Travel.do(context);
    });

interface FlightsBegin {
    destination: string;
}

class Flights extends Topic {

    async trigger() {
        return this.text && this.text.includes('flight')
            ? {
                beginArgs: {
                    destination: 'Paris'
                },
                score: .5
            } : {
                score: 0
            }
    }

    async onBegin(args?: FlightsBegin) {
        await this.context.sendActivity(`Let's fly to ${ args ? args.destination : 'a city'}!`)
    }

    async onTurn() {
        if (this.text === 'restart') {
            this.begun = false;
            return;
        }

        await this.context.sendActivity(`I don't really do much. Try "restart".`);
    }
}

interface HotelsBegin {
    chain: string;
}

class Hotels extends Topic <HotelsBegin> {

    async onBegin(args?: HotelsBegin) {
        await this.context.sendActivity(`Let's stay at a ${ args ? args.chain : 'hotel'}!`)
    }

    async trigger() {
        return this.text && this.text.includes('hotel')
            ? {
                beginArgs: {
                    chain: 'Hyatt'
                },
                score: .6
            } : {
                score: 0
            }
    }

    async onTurn() {
        if (this.text === 'restart') {
            this.begun = false;
            return;
        }

        await this.context.sendActivity(`I don't really do much. Try "restart".`);
    }
}

class Travel extends Topic  {

    static subtopics = [Flights, Hotels];

    async onBegin() {
        await this.context.sendActivity(`I can book flights and hotels.`);
        this.children = Travel.subtopics.map(T => this.createTopicInstance(T));
        console.log();
    }

    async onTurn() {
        if (await this.dispatchToChild())
            return;
        
        if (!await this.tryTriggers())
            await this.context.sendActivity(`I can't do that.`);
    }
}
