import { Activity } from 'botbuilder';

export type Telemetry = (
    context: BotContext,
    event: TelemetryAction,
) => Promise<void>;

export interface TelemetryAction {
    type: string,
    activity: Activity,
    instance: {
        instanceName: string,
        topicName: string,
        children: string[],
    }
}
