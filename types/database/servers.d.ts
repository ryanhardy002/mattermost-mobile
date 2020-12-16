// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import {Model} from '@nozbe/watermelondb';

/**
 * The Server model will help us to identify the various servers a user will log in; in the context of
 * multi-server support system.  The dbPath field will hold the App-Groups file-path
 */
export default class Servers extends Model {
    /** table (entity name) : servers */
    static table: string;

    /** db_path : The shared directory (e.g. App-Group) in which the database is stored */
    dbPath: string;

    /** display_name : The server display name */
    displayName: string;

    /** mention_count : The number of mention on this server */
    mentionCount: number;

    /** unread_count : The number of unread messages on this server */
    unreadCount: number;

    /** url : The online address for the Mattermost server */
    url: string;
}
