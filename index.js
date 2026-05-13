const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageTyping,
  ]
});

const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID;
const MOD_LOG_CHANNEL_ID = process.env.MOD_LOG_CHANNEL_ID;
const UNVERIFIED_ROLE_ID = process.env.UNVERIFIED_ROLE_ID;
const MEMBER_ROLE_ID = process.env.MEMBER_ROLE_ID;

const questions = [
  "What's your name?",
  "What's your age?",
  "What's your ethnicity, and what language do you speak?",
  "What brought you to our server?",
  "What do you like about Baltiyul?"
];

const pendingVerifications = new Map();

client.once('ready', () => {
  console.log(`Bot is online as ${client.user.tag}`);
});

client.on('guildMemberAdd', async (member) => {
  try {
    await member.roles.add(UNVERIFIED_ROLE_ID);
    const verifyChannel = await client.channels.fetch(VERIFY_CHANNEL_ID);
    await verifyChannel.send(
      `Welcome <@${member.id}>! Please check your DMs — our verification bot has sent you some questions. Answer them to get access to the server.`
    );
    await startVerification(member);
  } catch (err) {
    console.error('Error on member join:', err);
  }
});

async function startVerification(member) {
  try {
    const dm = await member.createDM();
    await dm.send(`Welcome to **Baltiyul**! Please answer the following questions to get verified. Take your time!`);

    const answers = [];

    for (const question of questions) {
      await dm.send(`**Q: ${question}**`);
      const collected = await dm.awaitMessages({
        max: 1,
        time: 5 * 60 * 1000,
        errors: ['time']
      }).catch(async () => {
        await dm.send('You took too long to respond. Please rejoin the server to try again.');
        return null;
      });

      if (!collected) return;
      answers.push(collected.first().content);
    }

    await dm.send('Thank you! Your answers have been sent to the moderators for review. Please wait while they check your application.');
    await sendToModLog(member, answers);
  } catch (err) {
    console.error('DM error:', err);
  }
}

async function sendToModLog(member, answers) {
  try {
    const modChannel = await client.channels.fetch(MOD_LOG_CHANNEL_ID);

    const embed = new EmbedBuilder()
      .setTitle('New Verification Application')
      .setColor(0x5865F2)
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'Member', value: `<@${member.id}> (${member.user.tag})` },
        { name: 'Joined', value: `<t:${Math.floor(Date.now() / 1000)}:R>` },
        ...questions.map((q, i) => ({ name: `Q${i + 1}: ${q}`, value: answers[i] || 'No answer' }))
      )
      .setFooter({ text: `User ID: ${member.id}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_${member.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deny_${member.id}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
    );

    await modChannel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('Mod log error:', err);
  }
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, userId] = interaction.customId.split('_');
  const guild = interaction.guild;

  try {
    const member = await guild.members.fetch(userId);

    if (action === 'approve') {
      await member.roles.add(MEMBER_ROLE_ID);
      await member.roles.remove(UNVERIFIED_ROLE_ID);
      await member.send('Your application has been **approved**! Welcome to Baltiyul, you now have full access to the server.');
      await interaction.update({
        content: `Approved by ${interaction.user.tag}`,
        components: []
      });
    } else if (action === 'deny') {
      await member.send('Your application has been **denied**. If you think this is a mistake, please contact a moderator.');
      await member.kick('Verification denied');
      await interaction.update({
        content: `Denied and kicked by ${interaction.user.tag}`,
        components: []
      });
    }
  } catch (err) {
    console.error('Button error:', err);
    await interaction.reply({ content: 'Could not find that member. They may have already left.', ephemeral: true });
  }
});

client.login(process.env.BOT_TOKEN);
