import { MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, prettyConsole, Waterfall, ValidatorResult, CultureConstructor, Prompt, hasNumber, hasText, consoleOnTurn, doTopic, PromptArgs, NumberPrompt, TextPrompt } from '../src/topical';

class PromptForName extends TextPrompt {

    validator = hasText
        .and((activity, text) => text.length > 1 && text.length < 30 || 'invalid_name');
}

class PromptForAge extends NumberPrompt {

    constructor(construct: CultureConstructor) {
        super(construct);

        this.validator = hasNumber(construct.culture)
            .and((activity, num) => num > 0 && num < 150 || 'invalid_age');
    }
}

class Age extends Waterfall {

    static subtopics = [PromptForName, PromptForAge];

    waterfall(next: (arg?: any) => void) {
        return [
            async () => {
                await this.beginChild(PromptForName, {
                    prompt: `What's your name?`,    
                    reprompt: `Please tell me your name`,
                });
            },

            async (name: string) => {
                await this.send(`Nice to meet you, ${this.text}!`);
                if (name === 'Bill Barnes')
                    next(51);
                else
                    await this.beginChild(PromptForAge, {
                        prompt: `How old are you?`,
                        reprompt: `Please tell me your age.`,   
                    }, { culture: 'en-us' }
                );
            },

            async (age: number) => {
                await this.send(age > 30
                    ? `You're ${age}? That's so old!`
                    : `Phew, you've still got a few good years left`
                );
            },
        ];
    }

    // uses default onBegin, onTurn, onChildReturn
}

class Root extends Topic {

    static subtopics = [Age];

    async onBegin() {
        await this.beginChild(Age);
    }

    // uses default onTurn, onChildReturn
}

// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

Topic.init(new MemoryStorage());

consoleOnTurn(
    new ConsoleAdapter()
        .use(prettyConsole),
    context => doTopic(Root, context)
);