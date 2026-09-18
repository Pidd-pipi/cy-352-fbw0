<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  createReservation,
  fetchAvailability,
  fetchState,
  rechargeMember,
  resetDemo,
  settleReservation,
} from "../api/booking";
import type {
  Booking,
  BookingState,
  RoomAvailability,
} from "../types/booking";

const loading = ref(false);
const state = ref<BookingState>({ rooms: [], members: [], bookings: [], settlements: [] });
const availability = ref<RoomAvailability[]>([]);
const queryDate = ref(today());

const form = reactive({
  roomId: "",
  memberId: "",
  date: today(),
  startHour: 14,
  endHour: 16,
});

const roomMap = computed(() => new Map(state.value.rooms.map((room) => [room.id, room])));
const memberMap = computed(
  () => new Map(state.value.members.map((member) => [member.id, member])),
);

const sortedBookings = computed(() =>
  [...state.value.bookings].sort((a, b) =>
    `${a.date}${a.startHour}`.localeCompare(`${b.date}${b.startHour}`),
  ),
);
const sortedSettlements = computed(() =>
  [...state.value.settlements].sort((a, b) => b.settledAt.localeCompare(a.settledAt)),
);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function roomName(id: string) {
  return roomMap.value.get(id)?.name ?? id;
}

function memberName(id: string) {
  return memberMap.value.get(id)?.name ?? id;
}

function statusTag(status: Booking["status"]) {
  if (status === "settled") return { type: "success", text: "已结算" };
  if (status === "cancelled") return { type: "info", text: "已取消" };
  return { type: "warning", text: "待到店" };
}

async function refresh() {
  loading.value = true;
  try {
    const [snapshot, slots] = await Promise.all([
      fetchState(),
      fetchAvailability(queryDate.value),
    ]);
    state.value = snapshot;
    availability.value = slots.rooms;
    if (!form.roomId && snapshot.rooms[0]) form.roomId = snapshot.rooms[0].id;
    if (!form.memberId && snapshot.members[0]) form.memberId = snapshot.members[0].id;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

async function submitBooking() {
  try {
    const result = await createReservation({ ...form });
    ElMessage.success(
      `预约成功：${result.booking.id}，预估 ¥${result.booking.amount.toFixed(2)}（结算时按会员折扣扣款）`,
    );
    await refresh();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "预约失败");
  }
}

async function settle(booking: Booking) {
  try {
    const result = await settleReservation(booking.id);
    if (result.idempotent) {
      ElMessage.warning(
        `该预约已结算过，重复结算未生效：实扣 ¥${result.settlement.paidAmount.toFixed(2)}`,
      );
    } else {
      ElMessage.success(
        `结算完成：实扣 ¥${result.settlement.paidAmount.toFixed(
          2,
        )}，积分 +${result.settlement.earnedPoints}，余额 ¥${result.member.balance.toFixed(2)}`,
      );
    }
    await refresh();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "结算失败");
  }
}

async function recharge(memberId: string, name: string) {
  try {
    const { value } = await ElMessageBox.prompt(`为 ${name} 充值（元）`, "会员储值", {
      confirmButtonText: "充值",
      cancelButtonText: "取消",
      inputPattern: /^\d+(\.\d{1,2})?$/,
      inputErrorMessage: "请输入正数金额，最多两位小数",
      inputValue: "100",
    });
    const result = await rechargeMember(memberId, Number(value));
    ElMessage.success(`充值成功，当前余额 ¥${result.balance.toFixed(2)}`);
    await refresh();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(error instanceof Error ? error.message : "充值失败");
    }
  }
}

async function reset() {
  try {
    await ElMessageBox.confirm("重置后所有预约与结算记录将恢复为演示初始数据，确定继续？", "重置数据", {
      type: "warning",
    });
    await resetDemo();
    ElMessage.success("已重置为演示数据");
    queryDate.value = today();
    form.date = today();
    await refresh();
  } catch {
    /* 用户取消 */
  }
}

onMounted(refresh);
</script>

<template>
  <section v-loading="loading" class="booking-page">
    <div class="section-head">
      <div>
        <h2>包厢预约与会员结算</h2>
        <p>同一包厢重叠时段仅一单可成；余额不足 / 时段冲突整次拒绝；到店结算原子扣款、累计积分，重复结算只生效一次。</p>
      </div>
      <el-button @click="refresh">刷新回读</el-button>
      <el-button type="danger" plain @click="reset">重置演示数据</el-button>
    </div>

    <!-- 会员卡片 -->
    <el-row :gutter="16" class="member-row">
      <el-col v-for="member in state.members" :key="member.id" :span="8">
        <el-card shadow="hover" class="member-card">
          <div class="member-head">
            <div>
              <strong>{{ member.name }}</strong>
              <el-tag size="small" type="primary" effect="plain" class="level-tag">
                {{ member.level }} · {{ member.discount === 1 ? "无折扣" : `${member.discount * 10} 折` }}
              </el-tag>
            </div>
            <el-button size="small" @click="recharge(member.id, member.name)">充值</el-button>
          </div>
          <div class="member-stats">
            <span>余额 <strong>¥{{ member.balance.toFixed(2) }}</strong></span>
            <span>积分 <strong>{{ member.points }}</strong></span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <!-- 空档展示 + 预约表单 -->
      <el-col :xs="24" :md="10">
        <el-card class="panel">
          <template #header>
            <div class="panel-title">
              <span>发起预约</span>
            </div>
          </template>
          <el-form label-position="top" :model="form">
            <el-form-item label="包厢">
              <el-select v-model="form.roomId" style="width: 100%">
                <el-option
                  v-for="room in state.rooms"
                  :key="room.id"
                  :label="`${room.name}（${room.capacity}人 · ¥${room.hourlyRate}/小时）`"
                  :value="room.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="会员">
              <el-select v-model="form.memberId" style="width: 100%">
                <el-option
                  v-for="member in state.members"
                  :key="member.id"
                  :label="`${member.name}（余额 ¥${member.balance.toFixed(2)}）`"
                  :value="member.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="日期">
              <el-date-picker
                v-model="form.date"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
            <el-row :gutter="12">
              <el-col :span="12">
                <el-form-item label="开始">
                  <el-time-select
                    v-model="form.startHour"
                    :start="9"
                    :end="23"
                    :step="1"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="结束">
                  <el-time-select
                    v-model="form.endHour"
                    :start="10"
                    :end="24"
                    :step="1"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
            </el-row>
            <el-button type="primary" style="width: 100%" @click="submitBooking">提交预约</el-button>
          </el-form>
        </el-card>
      </el-col>

      <!-- 空档表 -->
      <el-col :xs="24" :md="14">
        <el-card class="panel">
          <template #header>
            <div class="panel-title">
              <span>包厢空档（{{ queryDate }}）</span>
              <el-date-picker
                v-model="queryDate"
                type="date"
                value-format="YYYY-MM-DD"
                size="small"
                @change="refresh"
              />
            </div>
          </template>
          <div v-for="avail in availability" :key="avail.room.id" class="room-grid-block">
            <div class="room-grid-name">
              {{ avail.room.name }}
              <span class="muted">¥{{ avail.room.hourlyRate }}/h · {{ avail.room.capacity }}人</span>
            </div>
            <div class="slot-grid">
              <div
                v-for="slot in avail.slots"
                :key="slot.hour"
                class="slot"
                :class="`slot-${slot.status}`"
                :title="
                  slot.status === 'free'
                    ? '空档可约'
                    : `${slot.memberName ?? ''}（${statusTag(slot.status === 'settled' ? 'settled' : 'booked').text}）`
                "
              >
                <span class="slot-time">{{ slot.hour }}</span>
                <span class="slot-dot">{{ slot.status === "free" ? "空" : slot.status === "settled" ? "结" : "约" }}</span>
              </div>
            </div>
          </div>
          <div class="legend">
            <span><i class="legend-dot free" />空档</span>
            <span><i class="legend-dot booked" />已预约</span>
            <span><i class="legend-dot settled" />已结算</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 预约记录 -->
    <el-card class="panel">
      <template #header><span class="panel-title">预约记录</span></template>
      <el-table :data="sortedBookings" stripe style="width: 100%">
        <el-table-column prop="id" label="预约号" width="170" />
        <el-table-column label="包厢" width="150">
          <template #default="{ row }">{{ roomName(row.roomId) }}</template>
        </el-table-column>
        <el-table-column label="会员" width="120">
          <template #default="{ row }">{{ memberName(row.memberId) }}</template>
        </el-table-column>
        <el-table-column prop="date" label="日期" width="120" />
        <el-table-column label="时段" width="130">
          <template #default="{ row }">
            {{ String(row.startHour).padStart(2, "0") }}:00-{{ String(row.endHour).padStart(2, "0") }}:00
          </template>
        </el-table-column>
        <el-table-column label="预估金额" width="110">
          <template #default="{ row }">¥{{ row.amount.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status).type">{{ statusTag(row.status).text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作">
          <template #default="{ row }">
            <el-button
              size="small"
              type="success"
              :disabled="row.status !== 'booked'"
              @click="settle(row)"
            >
              {{ row.status === "settled" ? "已结算（重复点击幂等）" : "到店结算" }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 结算记录 -->
    <el-card class="panel">
      <template #header><span class="panel-title">结算记录</span></template>
      <el-table :data="sortedSettlements" stripe style="width: 100%">
        <el-table-column prop="id" label="结算号" width="180" />
        <el-table-column prop="bookingId" label="预约号" width="170" />
        <el-table-column label="包厢" width="150">
          <template #default="{ row }">{{ roomName(row.roomId) }}</template>
        </el-table-column>
        <el-table-column label="会员" width="120">
          <template #default="{ row }">{{ memberName(row.memberId) }}</template>
        </el-table-column>
        <el-table-column label="日期/时段">
          <template #default="{ row }">
            {{ row.date }} {{ String(row.startHour).padStart(2, "0") }}:00-{{
              String(row.endHour).padStart(2, "0")
            }}:00
          </template>
        </el-table-column>
        <el-table-column label="原价" width="100">
          <template #default="{ row }">¥{{ row.originalAmount.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="折扣" width="90">
          <template #default="{ row }">{{ row.discount === 1 ? "无" : `${row.discount * 10}折` }}</template>
        </el-table-column>
        <el-table-column label="实扣" width="110">
          <template #default="{ row }">
            <strong>¥{{ row.paidAmount.toFixed(2) }}</strong>
          </template>
        </el-table-column>
        <el-table-column prop="earnedPoints" label="积分" width="90" />
        <el-table-column label="结算时间" width="200">
          <template #default="{ row }">{{ new Date(row.settledAt).toLocaleString() }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </section>
</template>
