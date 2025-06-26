// D:\projetos\contask_v2\contask_api\controllers\BonusController.js
const { Op } = require("sequelize");
const sequelize = require("../db/conn");
const logger = require("../logger/logger");

const Company = require("../models/Company");
const User = require("../models/User");
const BonusFactor = require("../models/BonusFactor");
const BonusResult = require("../models/BonusResult");

// Chaves dos fatores para consistência
const FACTOR_KEYS = {
  DP_FATOR_1: "dp_fator_1",
  DP_FATOR_2: "dp_fator_2",
  FISCAL_VALOR_BASE_C: "fiscal_valor_base_c",
};

module.exports = class BonusController {
  /**
   * Busca os fatores de bônus e os retorna como um objeto chave-valor.
   */
  static async getBonusFactors(req, res) {
    try {
      const factors = await BonusFactor.findAll();
      // Inicializa com valores padrão caso não existam no banco
      const factorsMap = {
        [FACTOR_KEYS.DP_FATOR_1]: "0.00",
        [FACTOR_KEYS.DP_FATOR_2]: "0.00",
        [FACTOR_KEYS.FISCAL_VALOR_BASE_C]: "0.00",
      };
      factors.forEach((f) => {
        factorsMap[f.factorKey] = f.factorValue;
      });
      res.status(200).json(factorsMap);
    } catch (error) {
      logger.error(`Erro ao buscar fatores de bônus: ${error.message}`);
      res.status(500).json({ message: "Erro ao buscar fatores de bônus." });
    }
  }

  /**
   * Atualiza os valores dos fatores de bônus no banco.
   */
  static async updateBonusFactors(req, res) {
    const { dp_fator_1, dp_fator_2, fiscal_valor_base_c } = req.body;
    try {
      const factorsToUpdate = [
        { factorKey: FACTOR_KEYS.DP_FATOR_1, factorValue: dp_fator_1 },
        { factorKey: FACTOR_KEYS.DP_FATOR_2, factorValue: dp_fator_2 },
        {
          factorKey: FACTOR_KEYS.FISCAL_VALOR_BASE_C,
          factorValue: fiscal_valor_base_c,
        },
      ];

      for (const factor of factorsToUpdate) {
        await BonusFactor.upsert(factor);
      }

      logger.info(`Fatores de bônus atualizados por Admin (${req.user.email})`);
      res
        .status(200)
        .json({ message: "Fatores de bônus atualizados com sucesso." });
    } catch (error) {
      logger.error(`Erro ao atualizar fatores de bônus: ${error.message}`);
      res.status(500).json({ message: "Erro ao atualizar fatores de bônus." });
    }
  }

  /**
   * Busca os resultados de bônus previamente calculados.
   */
  static async getBonusResults(req, res) {
    try {
      const results = await BonusResult.findAll({
        order: [["userName", "ASC"]],
      });
      res.status(200).json(results);
    } catch (error) {
      logger.error(`Erro ao buscar resultados de bônus: ${error.message}`);
      res.status(500).json({ message: "Erro ao buscar resultados de bônus." });
    }
  }

  /**
   * Executa o cálculo completo de bônus para todos os funcionários dos departamentos Pessoal e Fiscal.
   */
  static async runFullBonusCalculation(req, res) {
    const transaction = await sequelize.transaction();
    try {
      logger.info(`Admin (${req.user.email}) iniciou o recálculo de bônus.`);

      // 1. Limpa os resultados antigos
      await BonusResult.destroy({ where: {}, transaction });

      // 2. Busca os fatores
      const factors = await BonusFactor.findAll({ transaction });
      const factorsMap = factors.reduce((acc, f) => {
        acc[f.factorKey] = parseFloat(f.factorValue);
        return acc;
      }, {});

      const FATOR1_DP = factorsMap[FACTOR_KEYS.DP_FATOR_1] || 0;
      const FATOR2_DP = factorsMap[FACTOR_KEYS.DP_FATOR_2] || 0;
      const VALOR_BASE_C_FISCAL =
        factorsMap[FACTOR_KEYS.FISCAL_VALOR_BASE_C] || 0;

      // 3. Busca usuários de DP e Fiscal
      const dpUsers = await User.findAll({
        where: { department: "Pessoal" },
        transaction,
      });

      // ALTERAÇÃO: Busca apenas usuários do fiscal que são elegíveis para bônus
      const fiscalUsersEligible = await User.findAll({
        where: { department: "Fiscal", hasBonus: true },
        transaction,
      });

      const allResults = [];
      const calculationDate = new Date();

      // --- 4. CÁLCULO PARA DEPARTAMENTO PESSOAL (Sem alteração) ---
      for (const user of dpUsers) {
        const companies = await Company.findAll({
          where: { respDpId: user.id, status: "ATIVA", isArchived: false },
          transaction,
        });
        let totalBonus = 0;
        const details = [];

        for (const company of companies) {
          let companyBonus = 0;
          const empCount = company.employeesCount || 0;
          if (empCount <= 1) {
            companyBonus = FATOR1_DP;
          } else {
            companyBonus = FATOR2_DP * empCount;
          }
          totalBonus += companyBonus;
          details.push({
            companyName: company.name,
            employeesCount: empCount,
            bonus: companyBonus,
          });
        }
        allResults.push({
          userId: user.id,
          userName: user.name,
          department: "Pessoal",
          totalBonus,
          details,
          calculationDate,
        });
      }

      // --- 5. CÁLCULO PARA DEPARTAMENTO FISCAL ---
      if (fiscalUsersEligible.length > 0) {
        const eligibleFiscalUserIds = fiscalUsersEligible.map((u) => u.id);

        // ALTERAÇÃO: O total 'A' agora considera apenas empresas dos usuários elegíveis.
        const totalActiveCompaniesResult = await Company.count({
          where: {
            status: "ATIVA",
            isArchived: false,
            respFiscalId: { [Op.in]: eligibleFiscalUserIds },
          },
          transaction,
        });
        const A = totalActiveCompaniesResult || 1;

        // ALTERAÇÃO: A soma 'B' também considera apenas empresas dos usuários elegíveis.
        const totalBonusValueResult = await Company.sum("bonusValue", {
          where: {
            status: "ATIVA",
            isArchived: false,
            respFiscalId: { [Op.in]: eligibleFiscalUserIds },
          },
          transaction,
        });
        const B = totalBonusValueResult || 1;

        const C = VALOR_BASE_C_FISCAL;

        const D = (B > 0 ? C / B : 0) + C * 0.05;
        const E = A > 0 ? C / A : 0;

        // ALTERAÇÃO: Loop itera apenas sobre os usuários elegíveis.
        for (const user of fiscalUsersEligible) {
          const companies = await Company.findAll({
            where: {
              respFiscalId: user.id,
              status: "ATIVA",
              isArchived: false,
            },
            transaction,
          });
          let totalBonus = 0;
          const details = [];

          for (const company of companies) {
            const companyBonusValue = company.bonusValue || 0;
            const calculatedBonus = companyBonusValue * D + E;
            totalBonus += calculatedBonus;
            details.push({
              companyName: company.name,
              bonusValue: companyBonusValue,
              bonus: calculatedBonus,
            });
          }
          allResults.push({
            userId: user.id,
            userName: user.name,
            department: "Fiscal",
            totalBonus,
            details,
            calculationDate,
          });
        }
      }

      // 6. Insere todos os resultados no banco
      if (allResults.length > 0) {
        await BonusResult.bulkCreate(allResults, { transaction });
      }

      await transaction.commit();
      logger.info("Cálculo de bônus concluído e salvo com sucesso.");
      res
        .status(200)
        .json({ message: "Cálculo de bônus concluído e salvo com sucesso." });
    } catch (error) {
      await transaction.rollback();
      logger.error(`Erro ao executar o cálculo de bônus: ${error.message}`, {
        stack: error.stack,
      });
      res
        .status(500)
        .json({ message: "Ocorreu um erro grave durante o cálculo de bônus." });
    }
  }
};
