import { MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, prettyConsole, consoleOnTurn, doTopic, startBestScoringChild } from '../src/topical';

interface FlightsStart {
    destination: string;
}

class Flights extends Topic<FlightsStart> {

    async getStartScore() {
        if (this.text && this.text.includes('flight'))
            return {
                startArgs: {
                    destination: 'Paris'
                },
                score: .5
            }
    }

    async onStart(args?: FlightsStart) {
        await this.send(`Let's fly to ${ args ? args.destination : 'a city'}!`)
    }

    async onDispatch() {
        await this.send(`That's my one trick. Try 'travel' to restart the bot.`);
    }
}
Flights.register();

interface HotelsStart {
    chain: string;
}

class Hotels extends Topic <HotelsStart> {

    async getStartScore() {
        if (this.text && this.text.includes('hotel'))
            return {
                startArgs: {
                    chain: 'Hyatt'
                },
                score: .6
            }
    }

    async onStart(args?: HotelsStart) {
        await this.send(`Let's stay at a ${ args ? args.chain : 'hotel'}!`)
    }

    async onDispatch() {
        await this.send(`That's my one trick. Try 'travel' to restart the bot.`);
    }
}
Hotels.register();

class Travel extends Topic  {

    async onStart() {
        await this.send(`I can book flights and hotels.`);
        this.createChild('flights', Flights);
        this.createChild('hotels', Hotels);
        console.log();
    }

    async onDispatch() {
        if (await this.dispatchToStartedChild())
            return;
        
        if (!await startBestScoringChild(this))
            await this.send(`I can't do that.`);
    }
}
Travel.register();

class Root extends Topic {

    async onStart() {
        await this.send(`Say 'travel' to start (or restart) the travel dialog.`);
    }

    async onDispatch() {
        if (this.text === 'travel') {
            await this.startChild(Travel);
            return;
        }

        await this.dispatchToChild();
    }
}
Root.register();

// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

Topic.init(new MemoryStorage());

consoleOnTurn(
    new ConsoleAdapter()
        .use(prettyConsole),
    context => doTopic(Root, context)
);