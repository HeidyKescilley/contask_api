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
    sentToClient: "sentToClientDp",
    declarationsCompleted: "declarationsCompletedDp",
    isZeroed: "isZeroedDp",
    hasNoObligations: "hasNoDpObligations",
    completedAt: "dpCompletedAt",
    bonusField: "employeesCount",
    zeroedBonusDefault: 0,
  },
  Contábil: {
    responsibleField: "respContabilId",
    responsibleAlias: "respContabil",
    bonusField: "accountingMonthsCount",
  },
};

function getDeptConfig(departmentName) {
  return DEPARTMENT_CONFIG[departmentName] || null;
}

function getAllDeptConfigs() {
  return DEPARTMENT_CONFIG;
}

module.exports = { DEPARTMENT_CONFIG, getDeptConfig, getAllDeptConfigs };
