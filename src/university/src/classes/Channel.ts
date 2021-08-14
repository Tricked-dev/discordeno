import Base from "./Base.ts";
import { Channel as ChannelPayload } from "../../../types/channels/channel.ts";
import Client from "./Client.ts";
import { snowflakeToBigint } from "../../../util/bigint.ts";
import { DiscordChannelTypes } from "../../../types/channels/channel_types.ts";
import { Collection } from "../../../util/collection.ts";
import Message from "./Message.ts";
import { CreateGuildChannel } from "../../../types/guilds/create_guild_channel.ts";
import { calculatePermissions } from "../../../util/permissions.ts";
import { DiscordOverwrite, Overwrite } from "../../../types/channels/overwrite.ts";
import { PermissionStrings } from "../../../types/permissions/permission_strings.ts";
import { DiscordBitwisePermissionFlags } from "../../../types/permissions/bitwise_permission_flags.ts";
import { endpoints } from "../../../util/constants.ts";
import { snakelize } from "../../../util/utils.ts";
import { PrivacyLevel } from "../../../types/channels/privacy_level.ts";
import { calculateBits } from "../../../util/permissions.ts";
import { Webhook } from "../../../types/webhooks/webhook.ts";
import { StageInstance } from "../../../types/channels/stage_instance.ts";
import { Message as MessagePayload } from "../../../types/messages/message.ts";

export class Channel extends Base {
  /** The guild id where this channel is located. If in a DM this is undefined. */
  guildId?: bigint;
  /** The type of the channel. */
  type: DiscordChannelTypes;
  /** All of the messages sent in this channel. */
  messages: Collection<bigint, Message>;
  /** The id of the last message that was sent in this channel, if any was sent. */
  lastMessageId?: bigint;
  /** The member count if this channel is a thread, otherwise it is 0. Counter maxes at 50 but discord allows more members. */
  memberCount: number;
  /** The name of the channel. */
  name: string;
  /** The topic of the channel. */
  topic: string;
  /** The bitrate (in bits) of the voice channel (voice only) */
  bitrate?: number;
  /** The user limit of the voice channel (voice only) */
  userLimit?: number;
  /** Amount of seconds a user has to wait before sending another message (0-21600); bots, as well as users with the permission `manage_messages` or `manage_channel`, are unaffected */
  rateLimitPerUser?: number;
  /** Sorting position of the channel */
  position?: number;
  /** The channel's permission overwrites */
  permissionOverwrites: (Omit<DiscordOverwrite, "id" | "allow" | "deny"> & {
    id: bigint;
    allow: bigint;
    deny: bigint;
  })[];
  /** Id of the parent category for a channel */
  parentId?: bigint;
  /** Whether the channel is nsfw */
  nsfw: boolean;

  constructor(client: Client, payload: ChannelPayload) {
    super(client, snowflakeToBigint(payload.id));

    this.lastMessageId = payload.lastMessageId ? snowflakeToBigint(payload.lastMessageId) : undefined;
    this.guildId = payload.guildId ? snowflakeToBigint(payload.guildId) : undefined;
    this.type = payload.type;
    this.memberCount = payload.memberCount || 0;
    this.name = payload.name || "";
    this.topic = payload.topic || "";
    this.bitrate = payload.bitrate;
    this.userLimit = payload.userLimit;
    this.rateLimitPerUser = payload.rateLimitPerUser;
    this.position = payload.position;
    this.parentId = payload.parentId ? snowflakeToBigint(payload.parentId) : undefined;
    this.nsfw = !!payload.nsfw;

    this.permissionOverwrites =
      payload.permissionOverwrites?.map((overwrite) => ({
        ...overwrite,
        id: snowflakeToBigint(overwrite.id),
        allow: snowflakeToBigint(overwrite.allow),
        deny: snowflakeToBigint(overwrite.deny),
      })) || [];

    this.messages = new Collection([], { sweeper: { filter: client.messageSweeper, interval: 300000 } });
  }

  /** The guild this channel is located in if it is in a guild */
  get guild() {
    return this.guildId ? this.client.guilds.get(this.guildId) : undefined;
  }

  /** The parent channel */
  get parent() {
    return this.guild?.channels.get(this.parentId!);
  }

  /** Create a copy of a channel */
  async clone(reason?: string) {
    const createChannelOptions: CreateGuildChannel = {
      name: this.name,
      type: this.type,
      topic: this.topic,
      bitrate: this.bitrate,
      userLimit: this.userLimit,
      rateLimitPerUser: this.rateLimitPerUser,
      position: this.position,
      parentId: this.parentId,
      nsfw: this.nsfw,
      permissionOverwrites: this.permissionOverwrites.map((overwrite) => ({
        id: overwrite.id.toString(),
        type: overwrite.type,
        allow: calculatePermissions(overwrite.allow),
        deny: calculatePermissions(overwrite.deny),
      })),
    };

    //Create the channel (also handles permissions)
    return await this.guild?.createChannel(createChannelOptions, reason);
  }

  /** Checks if a channel overwrite for a user id or a role id has permission in this channel */
  channelOverwriteHasPermission(id: bigint, permissions: PermissionStrings[]) {
    const overwrite =
      this.permissionOverwrites.find((perm) => perm.id === id) ||
      this.permissionOverwrites.find((perm) => perm.id === this.guildId);

    if (!overwrite) return false;

    return permissions.every((perm) => {
      const allowBits = overwrite.allow;
      const denyBits = overwrite.deny;
      if (BigInt(denyBits) & BigInt(DiscordBitwisePermissionFlags[perm])) {
        return false;
      }
      if (BigInt(allowBits) & BigInt(DiscordBitwisePermissionFlags[perm])) {
        return true;
      }
    });
  }

  /** Delete the channel permission overwrites for a user or role in this channel. Requires `MANAGE_ROLES` permission. */
  async deleteOverwrite(overwriteId: bigint) {
    return await this.client.rest.delete(endpoints.CHANNEL_OVERWRITE(this.id, overwriteId));
  }

  /** Edit the channel permission overwrites for a user or role in this channel. Requires `MANAGE_ROLES` permission. */
  async editChannelOverwrite(overwriteId: bigint, options: Omit<Overwrite, "id">): Promise<undefined> {
    return await this.client.rest.put(endpoints.CHANNEL_OVERWRITE(this.id, overwriteId), {
      allow: calculateBits(options.allow),
      deny: calculateBits(options.deny),
      type: options.type,
    });
  }

  /** Delete a channel in your server. Bot needs MANAGE_CHANNEL permissions in the server. */
  async delete(reason?: string) {
    return await this.client.rest.delete(endpoints.CHANNEL_BASE(this.id), {
      reason,
    });
  }

  /** Creates a new Stage instance associated to a Stage channel. Requires the user to be a moderator of the Stage channel. */
  async createStageInstance(topic: string, privacyLevel?: PrivacyLevel) {
    return await this.client.rest.post(
      endpoints.STAGE_INSTANCES,
      snakelize({
        channelId: this.id,
        topic,
        privacyLevel,
      })
    );
  }

  /** Deletes the Stage instance. Requires the user to be a moderator of the Stage channel. */
  async deleteStageInstance() {
    return await this.client.rest.delete(endpoints.STAGE_INSTANCE(this.id));
  }

  /** Gets the stage instance associated with the Stage channel, if it exists. */
  async getStageInstance() {
    return await this.client.rest.get(endpoints.STAGE_INSTANCE(this.id));
  }

  /** Updates fields of an existing Stage instance. Requires the user to be a moderator of the Stage channel. */
  async updateStageInstance(channelId: bigint, data: Partial<Pick<StageInstance, "topic" | "privacyLevel">> = {}) {
    return await this.client.rest.patch(endpoints.STAGE_INSTANCE(channelId), snakelize(data));
  }

  /** Gets the webhooks for this channel. Requires MANAGE_WEBHOOKS */
  async fetchWebhooks() {
    const result = (await this.client.rest.get(endpoints.CHANNEL_WEBHOOKS(this.id))) as Webhook[];

    return new Collection(result.map((webhook) => [webhook.id, webhook]));
  }

  /** Checks whether a channel is synchronized with its parent/category channel or not. */
  isSynced() {
    if (!this.parent) return false;

    return this.permissionOverwrites?.every((overwrite) => {
      const permission = this.parent.permissionOverwrites.find((ow) => ow.id === overwrite.id);
      if (!permission) return false;
      return !(overwrite.allow !== permission.allow || overwrite.deny !== permission.deny);
    });
  }

  /**
   * Trigger a typing indicator for the specified channel. Generally bots should **NOT** implement this route.
   * However, if a bot is responding to a command and expects the computation to take a few seconds,
   * this endpoint may be called to let the user know that the bot is processing their message.
   */
   async startTyping() {
    return await this.client.rest.post(endpoints.CHANNEL_TYPING(this.id));
  }

  /** Get pinned messages in this channel. */
  async fetchPins() {
    const result = (await this.client.rest.get(endpoints.CHANNEL_PINS(this.id))) as MessagePayload[];

    return result.map((res) => new Message(this.client, res));
  }

  /** Follow a News Channel to send messages to a target channel. Requires the `MANAGE_WEBHOOKS` permission in the target channel. Returns the webhook id. */
  async follow(targetChannelId: bigint) {
    const data = await this.client.rest.post(endpoints.CHANNEL_FOLLOW(this.id), {
      webhook_channel_id: targetChannelId,
    });

    return data.webhookId;

  }
}

export default Channel;
