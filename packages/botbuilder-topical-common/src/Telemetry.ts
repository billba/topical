import { Activity } from 'botbuilder';

export type Telemetry = (
    event: TelemetryAction,
) => Promise<void>;

export enum TelemetryActionType {
    newConversation = "newConversation",
    assignRootTopic = "assignRootTopic",
    endOfTurn = "endOfTurn",
    deleteInstance = "deleteInstance",
    initBegin = "init.begin",
    initEnd = "init.end",
    onReceiveBegin = "onReceive.begin",
    onReceiveEnd = "onReceive.end",
    nextBegin = "next.begin",
    nextEnd = "next.end",
    onChildReturnBegin = "onChildReturn.begin",
    onChildReturnEnd = "onChildReturn.end",
}

export interface TelemetryAction {
    type: string,
    activity: Activity,
    instance: {
        instanceName: string,
        topicName: string,
        children: string[],
    }
}
