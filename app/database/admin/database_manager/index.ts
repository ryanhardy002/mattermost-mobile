// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {MIGRATION_EVENTS, MM_TABLES} from '@constants/database';
import {Database, Model, Q} from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import {Class} from '@nozbe/watermelondb/utils/common';
import type {DefaultNewServer, MigrationEvents, MMDatabaseConnection} from '@typings/database/database';
import IServers from '@typings/database/servers';
import {deleteIOSDatabase, getIOSAppGroupDetails} from '@utils/mattermost_managed';
import {DeviceEventEmitter, Platform} from 'react-native';

import DefaultMigration from '../../default/migration';
import {App, Global, Servers} from '../../default/models';
import {defaultSchema} from '../../default/schema';
import ServerMigration from '../../server/migration';
import {
    Channel,
    ChannelInfo,
    ChannelMembership,
    CustomEmoji,
    Draft,
    File,
    Group,
    GroupMembership,
    GroupsInChannel,
    GroupsInTeam,
    MyChannel,
    MyChannelSettings,
    MyTeam,
    Post,
    PostMetadata,
    PostsInChannel,
    PostsInThread,
    Preference,
    Reaction,
    Role,
    SlashCommand,
    System,
    Team,
    TeamChannelHistory,
    TeamMembership,
    TeamSearchHistory,
    TermsOfService,
    User,
} from '../../server/models';
import {serverSchema} from '../../server/schema';

// TODO [x] : Initialize a db connection with default schema
// TODO [x] : handle migration
// TODO [x] : create server db
// TODO [x] : set active db
// TODO [x] : delete server db and removes its record in default db

// TODO [] : retrieve all dbs or a subset via the url and it then returns db instances

// TODO [] : factory reset - wipe every data on the phone

// TODO [] : how do we track down if migration succeeded on all the instances of 'server db'

// TODO : should we sanitize the display name of databases ?

// TODO :  review all private/public methods/fields

type Models = Class<Model>[]

export enum DatabaseType {
    DEFAULT,
    SERVER
}

class DatabaseManager {
    private activeDatabase: Database | undefined;
    private defaultDatabase: Database | undefined;
    private readonly defaultModels: Models;
    private readonly iOSAppGroupDatabase: string | undefined;
    private readonly serverModels: Models;

    constructor() {
        this.defaultModels = [App, Global, Servers];
        this.serverModels = [Channel, ChannelInfo, ChannelMembership, CustomEmoji, Draft, File, Group, GroupMembership,
            GroupsInChannel, GroupsInTeam, MyChannel, MyChannelSettings, MyTeam, Post, PostMetadata, PostsInChannel,
            PostsInThread, Preference, Reaction, Role, SlashCommand, System, Team, TeamChannelHistory, TeamMembership,
            TeamSearchHistory, TermsOfService, User];

        this.iOSAppGroupDatabase = getIOSAppGroupDetails().appGroupDatabase;
    }

    /**
     * createDatabaseConnection: Adds/Creates database connection and registers the new connection into the default database.  However,
     * if a database connection could not be created, it will return undefined.
     * @param {MMDatabaseConnection} databaseConnection
     * @param {boolean} shouldAddToDefaultDB
     * @returns {Database | undefined} :
     */
    createDatabaseConnection = async ({
        databaseConnection,
        shouldAddToDefaultDB = true,
    }: { databaseConnection: MMDatabaseConnection, shouldAddToDefaultDB: boolean }): Promise<Database | undefined> => {
        const {
            actionsEnabled = true,
            dbName = 'default',
            dbType = DatabaseType.DEFAULT,
            serverUrl = undefined,
        } = databaseConnection;

        try {
            const databaseName = dbType === DatabaseType.DEFAULT ? 'default' : dbName;

            const dbFilePath = await this.getDBDirectory({dbName: databaseName});

            const migrations = dbType === DatabaseType.DEFAULT ? DefaultMigration : ServerMigration;
            const modelClasses = dbType === DatabaseType.DEFAULT ? this.defaultModels : this.serverModels;
            const schema = dbType === DatabaseType.DEFAULT ? defaultSchema : serverSchema;

            const adapter = new SQLiteAdapter({
                dbName: dbFilePath,
                migrationEvents: this.buildMigrationCallbacks({dbName: databaseName}),
                migrations,
                schema,
            });

            // Registers the new server connection into the DEFAULT database
            if (serverUrl && shouldAddToDefaultDB) {
                await this.addServerToDefaultDB({dbFilePath, displayName: dbName, serverUrl});
            }

            return new Database({adapter, actionsEnabled, modelClasses});
        } catch (e) {
            // console.log(e);
        }

        return undefined;
    };

    /**
     * setActiveServerDatabase: From the displayName and serverUrl, we set the new active server database.  For example, on switching to another
     * another server, on a screen/component/list, we retrieve those values and call setActiveServerDatabase.
     * @param {string} displayName
     * @param {string} serverUrl
     */
    setActiveServerDatabase = async ({displayName, serverUrl}: { displayName: string, serverUrl: string }) => {
        this.activeDatabase = await this.createDatabaseConnection({
            databaseConnection: {
                actionsEnabled: true,
                dbName: displayName,
                dbType: DatabaseType.SERVER,
                serverUrl,
            },
            shouldAddToDefaultDB: true,
        });
    };

    /**
     * getActiveServerDatabase: The DatabaseManager should be the only one setting the active database.  Hence, we have made the activeDatabase property private.
     * Use this getter method to retrieve the active database if it has been set in your code.
     * @returns { Database | undefined}
     */
    getActiveServerDatabase = (): Database | undefined => {
        return this.activeDatabase;
    };

    /**
     * getDefaultDatabase : Returns the default database.
     * @returns {Database} default database
     */
    getDefaultDatabase = async (): Promise<Database | undefined> => {
        return this.defaultDatabase || this.setDefaultDatabase();
    };

    /**  FIXME : Implement this method
     * deleteDatabase: Deletes a database. The dbName parameter is actually passed by the caller.  For example, on the desktop app/preferences/server management,
     * we have a list of all the servers. Each item in that list will have information about the server.  On pressing 'remove', we passed in the display name
     * field to the parameter dbName.
     * @param {string} dbName
     * @param {string | undefined} serverUrl
     * @returns {Promise<void>}
     */
    // deleteDatabase = async ({dbName, serverUrl}: { dbName: string, serverUrl?: string }) => {
    // if (serverUrl) {
    //     // TODO :  if we have a server url then we retrieve the display name from the default database and then we delete it
    // }
    // try {
    //     const filePath = this.getDBDirectory({dbName});
    //     const info = await FileSystem.getInfoAsync(filePath);
    //
    //     console.log('File info ', info);
    //
    //     // deleting the .db file directly at the filePath
    //     const isDBFileDeleted = await FileSystem.deleteAsync(filePath, {idempotent: true});
    //
    //     console.log(`Database deleted at ${filePath}`, isDBFileDeleted);
    // } catch (e) {
    //     console.log('An error occured while attempting to delete the .db file', e);
    // }
    // return null;
    // };

    /**
     *
     * @param {string[]} serverUrls
     * @returns {Promise<any[] | Promise< | undefined>[]>}
     */
    retrieveServerDBInstances = async (serverUrls?: string[]) => {
        // Retrieve all server records from the default db
        const defaultDatabase = await this.getDefaultDatabase();
        const allServers = defaultDatabase && await defaultDatabase.collections.get(MM_TABLES.DEFAULT.SERVERS).query().fetch() as IServers[];

        if (serverUrls?.length) {
            // Filter only those servers that are present in the serverUrls array
            const servers = allServers!.filter((server: IServers) => {
                return serverUrls.includes(server.url);
            });

            // Creates server database instances
            if (servers.length) {
                return servers.map(async (server: IServers) => {
                    const {displayName, url} = server;
                    const databaseConnection = {
                        actionsEnabled: true,
                        dbName: displayName,
                        dbType: DatabaseType.SERVER,
                        serverUrl: url,
                    };

                    const dbInstance = await this.createDatabaseConnection({
                        databaseConnection,
                        shouldAddToDefaultDB: false,
                    });

                    // console.log({dbInstance});
                    return dbInstance;
                });
            }

            return [];
        }

        return [];
    };

    /**
     * deleteIOSServerDatabaseByName: Used solely on iOS platform to delete a database by its name
     * @param {string | undefined} databaseName
     */
    deleteIOSServerDatabaseByName = ({databaseName}: { databaseName: string }) => {
        try {
            if (databaseName) {
                deleteIOSDatabase({databaseName});
            }
        } catch (e) {
            // console.log('An error occured while trying to delete database with name ', databaseName);
        }
    };

    /**
     * factoryResetOnIOS: Deletes the database directory on iOS
     * @param {boolean} shouldRemoveDirectory
     */
    factoryResetOnIOS = ({shouldRemoveDirectory}: { shouldRemoveDirectory: boolean }) => {
        if (shouldRemoveDirectory) {
            deleteIOSDatabase({shouldRemoveDirectory: true});
        }
    };

    /**
     * removeServerFromDefaultDB : Removes a server record by its url value from the Default database
     * @param {string} serverUrl
     * @returns {Promise<void>}
     */
    removeServerFromDefaultDB = async ({serverUrl}: { serverUrl: string }) => {
        try {
            // Query the servers table to fetch the record with the above displayName
            const defaultDB = await this.getDefaultDatabase();
            if (defaultDB) {
                const serversRecord = await defaultDB.collections.get('servers').query(Q.where('url', serverUrl)).fetch() as IServers[];
                if (serversRecord.length) {
                    // Perform a delete operation on that record; since there is no sync with backend, we will delete the record permanently
                    await defaultDB.action(async () => {
                        await serversRecord[0].destroyPermanently();
                    });
                }
            }
        } catch (e) {
            // console.error('An error occured while deleting server record ', e);
        }
    };

    /**
     * setDefaultDatabase : Sets the default database.
     * @returns {Database} default database
     */
    private setDefaultDatabase = async (): Promise<Database | undefined> => {
        this.defaultDatabase = await this.createDatabaseConnection({
            databaseConnection: {dbName: 'default'},
            shouldAddToDefaultDB: false,
        });
        return this.defaultDatabase;
    };

    /**
     * addServerToDefaultDB: Adds a record into the 'default' database - into the 'servers' table - for this new server connection
     * @param {string} dbFilePath
     * @param {string} displayName
     * @param {string} serverUrl
     * @returns {Promise<void>}
     */
    private addServerToDefaultDB = async ({
        dbFilePath,
        displayName,
        serverUrl,
    }: DefaultNewServer) => {
        try {
            const defaultDatabase = await this.getDefaultDatabase();

            if (defaultDatabase) {
                await defaultDatabase.action(async () => {
                    const serversCollection = defaultDatabase.collections.get('servers');
                    await serversCollection.create((server: IServers) => {
                        server.dbPath = dbFilePath;
                        server.displayName = displayName;
                        server.mentionCount = 0;
                        server.unreadCount = 0;
                        server.url = serverUrl;
                    });
                });
            }
        } catch (e) {
            // console.log({catchError: e});
        }
    };

    /**
     * buildMigrationCallbacks: Creates a set of callbacks that can be used to monitor the migration process.
     * For example, we can display a processing spinner while we have a migration going on. Moreover, we can also
     * hook into those callbacks to assess how many of our servers successfully completed their migration.
     * @param {string} dbName
     * @returns {MigrationEvents}
     */
    private buildMigrationCallbacks = ({dbName}: { dbName: string }) => {
        const migrationEvents: MigrationEvents = {
            onSuccess: () => {
                return DeviceEventEmitter.emit(MIGRATION_EVENTS.MIGRATION_SUCCESS, {dbName});
            },
            onStarted: () => {
                return DeviceEventEmitter.emit(MIGRATION_EVENTS.MIGRATION_STARTED, {dbName});
            },
            onFailure: (error) => {
                return DeviceEventEmitter.emit(MIGRATION_EVENTS.MIGRATION_ERROR, {dbName, error});
            },
        };

        return migrationEvents;
    };

    /**
     * Retrieves the AppGroup shared directory on iOS or the DocumentsDirectory for Android and then places the
     * database file under the 'databases/{dbName}.db' directory. Examples of such directory are:
     * iOS Simulator : appGroup => /Users/{username}/Library/Developer/CoreSimulator/Devices/DA6F1C73/data/Containers/Shared/AppGroup/ACA65327"}
     * Android Device: file:///data/user/0/com.mattermost.rnbeta/files/
     *
     * @param {string} dbName
     * @returns {string}
     */
    private getDBDirectory = async ({dbName}: { dbName: string }): Promise<string> => {
        if (Platform.OS === 'ios') {
            return `${this.iOSAppGroupDatabase}/${dbName}.db`;
        }

        // FIXME : On Android side, you should save the *.db in the Documents directory
        // const androidDBPath = FileSystem.documentDirectory + `databases/${dbName}.db`;
        // await FileSystem.makeDirectoryAsync(androidDBPath, {intermediates: true});
        return `${dbName}`;
    };
}

export default new DatabaseManager();
