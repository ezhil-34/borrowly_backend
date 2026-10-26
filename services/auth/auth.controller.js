const authService = require('./auth.service');
const { safeUser } = require('../../common/utils');

async function signup(req, res) {
  const result = await authService.signup(req.body);
  res.status(201).json(result);
}

async function login(req, res) {
  const result = await authService.login(req.body);
  res.json(result);
}

async function resetPassword(req, res) {
  const result = await authService.createPasswordReset(req.body.email);
  res.json(result);
}

async function confirmReset(req, res) {
  const result = await authService.confirmPasswordReset(req.body);
  res.json(result);
}

async function getMe(req, res) {
  res.json({ user: safeUser(req.user) });
}

async function updateMe(req, res) {
  const updatedUser = await authService.updateProfile(req.user.id, req.body);
  res.json({ user: updatedUser });
}

module.exports = {
  signup,
  login,
  resetPassword,
  confirmReset,
  getMe,
  updateMe
};
