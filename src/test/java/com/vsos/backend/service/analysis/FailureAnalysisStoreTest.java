package com.vsos.backend.service.analysis;

import com.vsos.backend.common.analysis.FailureAnalysisJson;

import com.vsos.backend.repository.analysis.FailureAnalysisStore;
import com.vsos.backend.repository.analysis.FailureAnalysisStore.*;
import com.vsos.backend.repository.common.*;
import com.vsos.core.failureanalysis.Evidence;
import org.junit.jupiter.api.Test;
import org.springframework.dao.*;
import org.springframework.transaction.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** Real repository SQL/TransactionTemplate with mocked DB/transaction manager.
 * Commit/rollback calls are tested, not MySQL durability or FK enforcement. */
class FailureAnalysisStoreTest {
    private Db writableDb() {
        Db db=mock(Db.class);when(db.first(startsWith("SELECT p.status"),any(Object[].class)))
                .thenReturn(new Row(Evidence.obj("project_status","ACTIVE","workspace_id",null,"workspace_status",null)));return db;
    }
    private static Resource row(Kind kind,String id) {
        byte[] body="{}".getBytes(StandardCharsets.UTF_8);
        byte[] meta=FailureAnalysisJson.bytes(Evidence.obj("resource_schema","vehicsim.fa-rest-resource/v1","resource_kind",kind.name(),"id",id,"project_id",1,
                "source_id","source","execution_id","execution","byte_sha256",Evidence.sha256(body)));
        return new Resource(kind,id,1,"source","execution","a".repeat(64),null,body,Evidence.sha256(body),meta,Evidence.sha256(meta));
    }
    @Test void successfulGraphCommitsOnceAfterAllInserts() {
        Db db=writableDb();PlatformTransactionManager tx=mock(PlatformTransactionManager.class);TransactionStatus status=mock(TransactionStatus.class);
        when(tx.getTransaction(any())).thenReturn(status);var store=new FailureAnalysisStore(db,tx);
        Resource e=row(Kind.EXECUTION,"execution"),r=row(Kind.REPORT,"report"),h=row(Kind.HANDOFF,"handoff");
        assertThat(store.saveGraph(e,List.of(r,h))).isEqualTo(e);
        var order=inOrder(tx,db);order.verify(tx).getTransaction(any());
        order.verify(db).update(startsWith("INSERT INTO fa_json_executions"),any(Object[].class));
        order.verify(db).update(startsWith("INSERT INTO fa_json_reports"),any(Object[].class));
        order.verify(db).update(startsWith("INSERT INTO fa_json_handoffs"),any(Object[].class));order.verify(tx).commit(status);
        verify(tx,never()).rollback(any());
    }
    @Test void childWriteFailureRollsBackGraphAndPropagatesNoSuccess() {
        Db db=writableDb();PlatformTransactionManager tx=mock(PlatformTransactionManager.class);TransactionStatus status=mock(TransactionStatus.class);
        when(tx.getTransaction(any())).thenReturn(status);var store=new FailureAnalysisStore(db,tx);
        when(db.update(startsWith("INSERT INTO fa_json_reports"),any(Object[].class))).thenThrow(new DataAccessResourceFailureException("synthetic"));
        assertThatThrownBy(()->store.saveGraph(row(Kind.EXECUTION,"execution"),List.of(row(Kind.REPORT,"report"),row(Kind.HANDOFF,"handoff")))).isInstanceOf(DataAccessException.class);
        verify(tx).rollback(status);verify(tx,never()).commit(any());
        verify(db,never()).update(startsWith("INSERT INTO fa_json_handoffs"),any(Object[].class));
    }
    @Test void duplicateKeyReadsWinnerOnlyAfterRollback() {
        Db db=writableDb();PlatformTransactionManager tx=mock(PlatformTransactionManager.class);TransactionStatus status=mock(TransactionStatus.class);
        when(tx.getTransaction(any())).thenReturn(status);var store=new FailureAnalysisStore(db,tx);Resource winner=row(Kind.EXECUTION,"winner");
        when(db.update(startsWith("INSERT INTO fa_json_executions"),any(Object[].class))).thenThrow(new DuplicateKeyException("synthetic race"));
        when(db.first(contains("dedupe_key = ?"),any(Object[].class))).thenReturn(new Row(Evidence.obj("id",winner.id(),"project_id",1L,
                "source_id",winner.sourceId(),"execution_id",winner.executionId(),"dedupe_key",winner.key(),"identity_digest",null,
                "payload_bytes",winner.body(),"payload_sha256",winner.byteDigest(),"metadata_bytes",winner.metadata(),"metadata_sha256",winner.metadataDigest())));
        assertThat(store.saveGraph(row(Kind.EXECUTION,"loser"),List.of()).id()).isEqualTo("winner");
        var order=inOrder(tx,db);order.verify(tx).getTransaction(any());order.verify(db).update(anyString(),any(Object[].class));
        order.verify(tx).rollback(status);order.verify(db).first(contains("project_id = ? AND dedupe_key = ?"),any(Object[].class));
    }
    @Test void everyResourceQueryIsProjectScopedAndNoUpdateDeleteIsExposed() {
        Db db=mock(Db.class);var store=new FailureAnalysisStore(db,mock(PlatformTransactionManager.class));
        for(Kind kind:Kind.values()) {
            store.find(kind,9,"id");store.byKey(kind,9,"key");
            verify(db).first("SELECT * FROM "+switch(kind){case SOURCE->"fa_json_sources";case EXECUTION->"fa_json_executions";case REPORT->"fa_json_reports";case HANDOFF->"fa_json_handoffs";}+" WHERE project_id = ? AND id = ?",9L,"id");
        }
        verify(db,never()).update(anyString(),any(Object[].class));
    }
}
