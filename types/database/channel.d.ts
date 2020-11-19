// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import Model, {Associations} from '@nozbe/watermelondb/Model';
export default class Channel extends Model {
    static table: string;
    static associations: Associations;
    channelId: string;
    createAt: number;
    creatorId: string;
    deleteAt: number;
    displayName: string;
    isGroupConstrained: boolean;
    name: string;
    team_id: string;
    type: string;
}
