// /controllers/UserController.js
const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const logger = require("../logger/logger"); // Importa o logger do Winston

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
      password,
      confirmpassword,
      ramal,
    } = req.body;

    logger.info(`Tentativa de registro de usuário com email: ${email}`);

    // validações
    if (!name) {
      logger.warn("Registro falhou: Nome não fornecido.");
      return res.status(422).json({ message: "O nome é obrigatório!" });
    }
    if (!email) {
      logger.warn("Registro falhou: Email não fornecido.");
      return res.status(422).json({ message: "O email é obrigatório!" });
    }
    if (!birthday) {
      logger.warn("Registro falhou: Aniversário não fornecido.");
      return res.status(422).json({ message: "O aniversário é obrigatório!" });
    }
    if (!department) {
      logger.warn("Registro falhou: Departamento não fornecido.");
      return res.status(422).json({ message: "O departamento é obrigatório!" });
    }
    if (!password) {
      logger.warn("Registro falhou: Senha não fornecida.");
      return res.status(422).json({ message: "A senha é obrigatória!" });
    }
    if (!confirmpassword) {
      logger.warn("Registro falhou: Confirmação de senha não fornecida.");
      return res
        .status(422)
        .json({ message: "A confirmação de senha é obrigatória" });
    }

    if (password !== confirmpassword) {
      logger.warn("Registro falhou: Senhas não conferem.");
      return res.status(422).json({ message: "As senhas não conferem" });
    }

    // verifica se o usuário já existe
    const userExists = await User.findOne({ where: { email } });

    if (userExists) {
      logger.warn(`Registro falhou: Email já utilizado - ${email}`);
      return res
        .status(422)
        .json({ message: "Email já utilizado, tente outro" });
    }

    // cria a senha
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // cria o usuário
    const user = {
      name,
      email,
      birthday,
      department,
      role: "not-validated",
      password: passwordHash,
      ramal,
    };

    try {
      await User.create(user);
      logger.info(`Usuário registrado com sucesso: ${email}`);
      return res.status(201).json({ message: "Usuário criado com sucesso!" });
    } catch (error) {
      logger.error(`Erro ao registrar usuário: ${error.message}`);
      return res.status(500).json({ message: error });
    }
  }

  static async login(req, res) {
    const { email, password } = req.body;

    logger.info(`Tentativa de login para o email: ${email}`);

    if (!email) {
      logger.warn("Login falhou: Email não fornecido.");
      return res.status(422).json({ message: "O email é obrigatório" });
    }
    if (!password) {
      logger.warn("Login falhou: Senha não fornecida.");
      return res.status(422).json({ message: "A senha é obrigatória" });
    }

    // verifica se o usuário existe
    const user = await User.findOne({ where: { email } });

    if (!user) {
      logger.warn(`Login falhou: Nenhum usuário encontrado com email ${email}`);
      return res
        .status(422)
        .json({ message: "Não há usuário cadastrado com esse email" });
    }

    // verifica se a senha corresponde
    const checkPassword = await bcrypt.compare(password, user.password);

    if (!checkPassword) {
      logger.warn(`Login falhou: Senha inválida para email ${email}`);
      return res.status(422).json({
        message: "Senha inválida!",
      });
    }

    // Verifica se o usuário está validado
    if (user.role === "not-validated") {
      logger.warn(`Login tentado por usuário não validado: ${email}`);
      return res.status(403).json({
        message:
          "Seu cadastro ainda não foi validado. Por favor, entre em contato com o administrador.",
      });
    }

    logger.info(`Usuário logado com sucesso: ${email}`);
    return await createUserToken(user, req, res);
  }

  static async checkUser(req, res) {
    let currentUser;

    if (req.headers.authorization) {
      const token = getToken(req);
      const secret = process.env.JWT_SECRET;

      try {
        const decoded = jwt.verify(token, secret);

        currentUser = await User.findOne({
          where: { id: decoded.id },
          attributes: { exclude: ["password"] },
        });

        currentUser.password = undefined;
      } catch (err) {
        logger.warn("CheckUser falhou: Token inválido.");
        return res.status(400).json({ message: "Token inválido!" });
      }
    } else {
      currentUser = null;
    }

    logger.info(
      `CheckUser chamado. Usuário atual: ${
        currentUser ? currentUser.email : "Nenhum usuário"
      }`
    );
    return res.status(200).send(currentUser);
  }

  static async getUserById(req, res) {
    const id = req.params.id;

    try {
      const user = await User.findOne({
        where: { id },
        attributes: { exclude: ["password"] },
      });

      if (!user) {
        logger.warn(`GetUserById falhou: Usuário não encontrado (ID: ${id})`);
        return res.status(422).json({
          message: "Usuário não encontrado!",
        });
      }

      logger.info(`Usuário obtido com sucesso: ${user.email}`);
      return res.status(200).json(user);
    } catch (error) {
      logger.error(`Erro ao obter usuário por ID: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async getUsersByDepartment(req, res) {
    const { department } = req.params;

    try {
      const users = await User.findAll({
        where: { department },
        attributes: ["id", "name"],
      });

      if (!users || users.length === 0) {
        logger.warn(
          `GetUsersByDepartment falhou: Nenhum usuário encontrado no departamento ${department}`
        );
        return res
          .status(404)
          .json({ message: "Nenhum usuário encontrado neste departamento" });
      }

      logger.info(
        `Usuários obtidos com sucesso para o departamento ${department}: ${users.length} encontrados.`
      );
      return res.status(200).json(users);
    } catch (error) {
      logger.error(
        `Erro ao buscar usuários por departamento: ${error.message}`
      );
      return res.status(500).json({ message: error.message });
    }
  }

  static async editUser(req, res) {
    // verifica se o usuário existe
    const token = await getToken(req);
    const user = await getUserByToken(token);

    const { password, confirmpassword, ramal } = req.body;

    const updateData = {
      ramal,
    };

    if (password && confirmpassword) {
      if (password !== confirmpassword) {
        logger.warn(
          `EditUser falhou: Senhas não conferem para usuário ${user.email}`
        );
        return res.status(422).json({ message: "As senhas não conferem" });
      }

      // cria a senha
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(password, salt);
      updateData.password = passwordHash;
    }

    try {
      // atualiza os dados do usuário
      await User.update(updateData, { where: { id: user.id } });

      logger.info(`Usuário atualizado com sucesso: ${user.email}`);
      return res.status(200).json({
        message: "Usuário atualizado com sucesso!",
        data: updateData,
      });
    } catch (err) {
      logger.error(`Erro ao atualizar usuário: ${err.message}`);
      return res.status(500).json({ message: err });
    }
  }

  // Método para obter todos os usuários
  static async getAllUsers(req, res) {
    try {
      logger.info(`Admin (${req.user.email}) solicitou todos os usuários.`);
      const users = await User.findAll({
        attributes: ["id", "name", "email", "department", "ramal", "role"],
      });
      res.status(200).json({ users });
    } catch (error) {
      logger.error(`Erro ao buscar todos os usuários: ${error.message}`);
      res.status(500).json({ message: "Erro ao buscar os usuários." });
    }
  }
};
