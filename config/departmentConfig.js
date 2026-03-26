const DEPARTMENT_CONFIG = {
  Fiscal: {
    responsibleField: "respFiscalId",
    responsibleAlias: "respFiscal",
    sentToClient: "sentToClientFiscal",
    isZeroed: "isZeroedFiscal",
    completedAt: "fiscalCompletedAt",
    bonusField: "bonusValue",
    zeroedBonusDefault: 1,
    obligationsEnabled: true,
  },
  Pessoal: {
    responsibleField: "respDpId",
    responsibleAlias: "respDp",
    isZeroed: "isZeroedDp",
    completedAt: "dpCompletedAt",
    bonusField: "employeesCount",
    zeroedBonusDefault: 0,
    obligationsEnabled: true,
  },
  Contábil: {
    responsibleField: "respContabilId",
    responsibleAlias: "respContabil",
    isZeroed: "isZeroedContabil",
    completedAt: "contabilCompletedAt",
    bonusField: "accountingMonthsCount",
    obligationsEnabled: true,
  },
};

function getDeptConfig(departmentName) {
  return DEPARTMENT_CONFIG[departmentName] || null;
}

function getAllDeptConfigs() {
  return DEPARTMENT_CONFIG;
}

module.exports = { DEPARTMENT_CONFIG, getDeptConfig, getAllDeptConfigs };
