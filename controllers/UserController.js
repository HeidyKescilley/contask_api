// /controllers/UserController.js
const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// helpers
const createUserToken = require("../helpers/create-user-token");
const getToken = require("../helpers/get-token");
const getUserByToken = require("../helpers/get-user-by-token");

module.exports = class UserController {
  static async register(req, res) {
    const {
      name,
      email,
      birthday,
      department,
      administrator,
      password,
      confirmpassword,
      ramal,
    } = req.body;

    // validations
    if (!name) {
      return res.status(422).json({ message: "O nome é obrigatorio!" });
    }
    if (!email) {
      return res.status(422).json({ message: "O email é obrigatorio!" });
    }
    if (!birthday) {
      return res.status(422).json({ message: "O aniversário é obrigatório!" });
    }
    if (!department) {
      return res.status(422).json({ message: "O departamento é obrigatório!" });
    }
    if (!password) {
      return res.status(422).json({ message: "A senha é obrigatorio!" });
    }
    if (!confirmpassword) {
      return res
        .status(422)
        .json({ message: "A confirmação de senha é obrigatória" });
    }

    if (password !== confirmpassword) {
      return res.status(422).json({ message: "As senhas não conferem" });
    }

    // check if user exists
    const userExists = await User.findOne({ where: { email } });

    if (userExists) {
      return res
        .status(422)
        .json({ message: "Email já utilizado, tente outro" });
    }

    // create a password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // create a user
    const user = {
      name,
      email,
      birthday,
      department,
      administrator: administrator ? 1 : 0,
      password: passwordHash,
      ramal,
    };

    try {
      await User.create(user);
      return res.status(201).json({ message: "Usuario criado com sucesso!" });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async login(req, res) {
    const { email, password } = req.body;

    if (!email) {
      return res.status(422).json({ message: "O email é obrigatorio" });
    }
    if (!password) {
      return res.status(422).json({ message: "A senha é obrigatorio" });
    }

    // check if user exists
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res
        .status(422)
        .json({ message: "Não há usuario cadastrado com esse email" });
    }

    // check if password matches with db password
    const checkPassword = await bcrypt.compare(password, user.password);

    if (!checkPassword) {
      return res.status(422).json({
        message: "Senha inválida!",
      });
    }

    return await createUserToken(user, req, res);
  }

  static async checkUser(req, res) {
    let currentUser;

    if (req.headers.authorization) {
      const token = getToken(req);
      const decoded = jwt.verify(token, "aquicolocaosecret");

      currentUser = await User.findOne({ where: { id: decoded.id } });

      currentUser.password = undefined;
    } else {
      currentUser = null;
    }

    return res.status(200).send(currentUser);
  }

  static async getUserById(req, res) {
    const id = req.params.id;

    const user = await User.findOne({
      where: { id },
      attributes: { exclude: ["password"] },
    });

    if (!user) {
      return res.status(422).json({
        message: "Usuário não encontrado!",
      });
    }

    return res.status(200).json({ user });
  }

  static async getUsersByDepartment(req, res) {
    const { department } = req.params;

    try {
      const users = await User.findAll({
        where: { department },
        attributes: ["id", "name"],
      });

      if (!users || users.length === 0) {
        return res
          .status(404)
          .json({ message: "No users found in this department" });
      }

      return res.status(200).json(users);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }

  static async getAllUsers(req, res) {
    const users = await User.findAll();

    if (!users || users.length === 0) {
      return res.status(404).json({ message: "No users found!" });
    }

    return res.status(200).json(users);
  }

  static async editUser(req, res) {
    // check if user exists
    const token = await getToken(req);
    const user = await getUserByToken(token);

    const { password, confirmpassword, ramal } = req.body;

    const updateData = {
      ramal,
    };

    if (password != confirmpassword) {
      return res.status(422).json({ message: "As senhas não conferem" });
    } else if (password === confirmpassword && password != null) {
      // creating password
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(password, salt);
      updateData.password = passwordHash;
    }

    try {
      // return user updated data
      await User.update(updateData, { where: { id: user.id } });

      return res.status(200).json({
        message: "Usuário atualizado com sucesso!",
        data: updateData,
      });
    } catch (err) {
      return res.status(500).json({ message: err });
    }
  }
};
