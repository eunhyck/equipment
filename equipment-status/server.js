// server.js
const express = require("express");
const oracledb = require("oracledb");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 3000;

oracledb.initOracleClient({
  libDir: "C:\\oraclexe\\instantclient_19_29", // 네가 압축 푼 폴더 경로
});
// Oracle autoCommit 켜두면 CRUD 결과가 바로 커밋됨
oracledb.autoCommit = true;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // 프론트 정적 파일 제공

// ✅ Thick 모드 사용 선언 (Instant Client 위치 지정)

// ※ TODO: 여기를 본인 Oracle 환경에 맞게 수정
const dbConfig = {
  user: "system",
  password: "1234",
  connectString: "localhost:1521/XE", // 예: 'localhost:1521/xepdb1'
};

// Oracle Pool 생성
async function initOracle() {
  try {
    await oracledb.createPool(dbConfig);
    console.log("Oracle 연결 풀 생성 완료");
  } catch (err) {
    console.error("Oracle 풀 생성 오류:", err);
    process.exit(1);
  }
}

// 공통 커넥션 헬퍼
async function getConnection() {
  return await oracledb.getConnection();
}

/**
 * 장비 목록 조회
 * GET /api/equipments
 */
app.get("/api/equipments", async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `
      SELECT
        EQUIP_ID,
        EQUIP_NAME,
        MANAGER,
        STATUS,
        LOCATION,
        TO_CHAR(UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT
      FROM EQUIPMENT
      ORDER BY EQUIP_ID DESC
      `
    );

    const rows = result.rows.map((row) => ({
      EQUIP_ID: row[0],
      EQUIP_NAME: row[1],
      MANAGER: row[2],
      STATUS: row[3],
      LOCATION: row[4],
      UPDATED_AT: row[5],
    }));

    res.json(rows);
  } catch (err) {
    console.error("장비 목록 조회 오류:", err);
    res.status(500).json({ message: "장비 목록 조회 중 오류가 발생했습니다." });
  } finally {
    if (conn) await conn.close();
  }
});

/**
 * 장비 등록
 * POST /api/equipments
 * body: { equipName, manager, status, location }
 */
app.post("/api/equipments", async (req, res) => {
  const { equipName, manager, status, location } = req.body;

  if (!equipName || equipName.trim().length === 0) {
    return res.status(400).json({ message: "장비명은 필수입니다." });
  }

  // 상태가 없으면 기본값 '정상'
  const finalStatus = status || "정상";

  let conn;
  try {
    conn = await getConnection();
    await conn.execute(
      `
      INSERT INTO EQUIPMENT (EQUIP_NAME, MANAGER, STATUS, LOCATION, UPDATED_AT)
      VALUES (:equipName, :manager, :status, :location, SYSDATE)
      `,
      {
        equipName,
        manager,
        status: finalStatus,
        location,
      }
    );

    res.status(201).json({ message: "장비가 등록되었습니다." });
  } catch (err) {
    console.error("장비 등록 오류:", err);
    res.status(500).json({ message: "장비 등록 중 오류가 발생했습니다." });
  } finally {
    if (conn) await conn.close();
  }
});

/**
 * 장비 수정 (전체 수정)
 * PUT /api/equipments/:id
 * body: { equipName, manager, status, location }
 */
app.put("/api/equipments/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { equipName, manager, status, location } = req.body;

  if (!id) {
    return res.status(400).json({ message: "잘못된 장비 ID입니다." });
  }

  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `
      UPDATE EQUIPMENT
      SET
        EQUIP_NAME = :equipName,
        MANAGER    = :manager,
        STATUS     = :status,
        LOCATION   = :location,
        UPDATED_AT = SYSDATE
      WHERE EQUIP_ID = :id
      `,
      {
        equipName,
        manager,
        status,
        location,
        id,
      }
    );

    if (result.rowsAffected === 0) {
      return res
        .status(404)
        .json({ message: "해당 ID의 장비를 찾을 수 없습니다." });
    }

    res.json({ message: "장비 정보가 수정되었습니다." });
  } catch (err) {
    console.error("장비 수정 오류:", err);
    res.status(500).json({ message: "장비 수정 중 오류가 발생했습니다." });
  } finally {
    if (conn) await conn.close();
  }
});

/**
 * 장비 상태만 변경 (정상 / 점검중 / 장애)
 * PATCH /api/equipments/:id/status
 * body: { status }
 */
app.patch("/api/equipments/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;

  if (!id) {
    return res.status(400).json({ message: "잘못된 장비 ID입니다." });
  }

  if (!status || !["정상", "점검중", "장애"].includes(status)) {
    return res
      .status(400)
      .json({ message: "상태는 [정상, 점검중, 장애] 중 하나여야 합니다." });
  }

  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `
      UPDATE EQUIPMENT
      SET STATUS = :status,
          UPDATED_AT = SYSDATE
      WHERE EQUIP_ID = :id
      `,
      { status, id }
    );

    if (result.rowsAffected === 0) {
      return res
        .status(404)
        .json({ message: "해당 ID의 장비를 찾을 수 없습니다." });
    }

    res.json({ message: "장비 상태가 변경되었습니다." });
  } catch (err) {
    console.error("장비 상태 변경 오류:", err);
    res.status(500).json({ message: "장비 상태 변경 중 오류가 발생했습니다." });
  } finally {
    if (conn) await conn.close();
  }
});

/**
 * 장비 삭제
 * DELETE /api/equipments/:id
 */
app.delete("/api/equipments/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "잘못된 장비 ID입니다." });
  }

  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `
      DELETE FROM EQUIPMENT
      WHERE EQUIP_ID = :id
      `,
      { id }
    );

    if (result.rowsAffected === 0) {
      return res
        .status(404)
        .json({ message: "해당 ID의 장비를 찾을 수 없습니다." });
    }

    res.json({ message: "장비가 삭제되었습니다." });
  } catch (err) {
    console.error("장비 삭제 오류:", err);
    res.status(500).json({ message: "장비 삭제 중 오류가 발생했습니다." });
  } finally {
    if (conn) await conn.close();
  }
});

// 서버 시작
initOracle().then(() => {
  app.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  });
});
