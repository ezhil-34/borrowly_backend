const messagingService = require('./messaging.service');

async function getChat(req, res) {
  const messages = await messagingService.getChatMessages(req.params.id, req.user);
  res.json({ messages });
}

async function sendMessage(req, res) {
  const message = await messagingService.sendChatMessage(req.params.id, req.body.text, req.user);
  res.status(201).json({ message });
}

async function getNotifications(req, res) {
  const result = await messagingService.getNotifications(req.user.id);
  res.json(result);
}

async function markNotificationsRead(req, res) {
  const result = await messagingService.markNotificationsRead(req.user.id);
  res.json(result);
}

async function submitReport(req, res) {
  const result = await messagingService.submitReport(req.body, req.user);
  res.status(201).json(result);
}

module.exports = {
  getChat,
  sendMessage,
  getNotifications,
  markNotificationsRead,
  submitReport
};
