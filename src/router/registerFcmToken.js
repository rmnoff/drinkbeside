import { userByID, updateUserFcmToken } from '../database';

export const registerFcmToken = async (req, res) => {
  const data = req.body;
  const token = data.token;
  const id = Number.parseInt(data.userId);
  const user = await userByID(id);
  if (user) {
    const updatedUser = await updateUserFcmToken(id, token);
    if (updatedUser) return res.json({
      error: null,
      data: updatedUser
    });
  }
  res.status(500).json({
    error: 'Ошибка обновления данных пользователя',
    data: null
  });
};