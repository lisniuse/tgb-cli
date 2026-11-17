import { describe, expect, test } from "bun:test";
import { parseContest } from "../src/api/contest.ts";

describe("实盘比赛解析", () => {
  test("进行中比赛", () => {
    const contest = parseContest(
      {
        seq: 881,
        userID: 8144360,
        userName: "淘股吧比赛",
        subject: "26年官方年赛",
        simpleName: "26年官方年赛",
        spType: "Y",
        allMoneyStr: "5.67亿",
        nowUserNum: 1860,
        avgAllRate: -1951,
        currentDif: 317,
        daysDif: 360,
        matchTimeStart: 1767596400000,
        matchTimeEnd: 1798732740000,
        newTopicID: "2nPcAoCrpCL",
      },
      "ongoing",
    );

    expect(contest.name).toBe("26年官方年赛");
    expect(contest.host).toBe("淘股吧比赛");
    expect(contest.type).toBe("年赛");
    expect(contest.totalMoney).toBe("5.67亿");
    expect(contest.players).toBe(1860);
    expect(contest.avgRate).toBe("-19.51%");
    expect(contest.progress).toBe("317/360天");
    expect(contest.status).toBe("ongoing");
    expect(contest.url).toBe("https://www.tgb.cn/spmatch/matchAll?tid=2nPcAoCrpCL");
    expect(contest.startTime).toContain("2026");
  });

  test("报名中比赛", () => {
    const contest = parseContest(
      {
        seq: 965,
        userName: "超短小妖女",
        subject: "第六十一届赢家e万杯实盘赛",
        simpleName: "61届赢家e万",
        spType: "M",
        nowUserNum: 721,
        entryTimeEnd: 1796108340000,
        needMoney: 10000,
        newTopicID: "2wSignup",
      },
      "signup",
    );

    expect(contest.type).toBe("月赛");
    expect(contest.players).toBe(721);
    expect(contest.needMoney).toBe("1.00万");
    expect(contest.entryEnd).toContain("2026");
    expect(contest.status).toBe("signup");
  });

  test("已结束比赛按站点格式展示平均收益", () => {
    const contest = parseContest(
      {
        subject: "12届博裕杯双月实盘赛",
        simpleName: "12届博裕双月",
        userName: "伊泽瑞尔",
        spType: "M",
        avgAllRate: -15.59,
        nowUserNum: 776,
        allMoney: 105034608,
        newTopicID: "2uky29c8mIM",
      },
      "ended",
    );

    expect(contest.avgRate).toBe("-0.16%");
    expect(contest.totalMoney).toBe("1.05亿");
    expect(contest.status).toBe("ended");
  });
});
