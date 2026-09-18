<script setup lang="ts">
import { ElMessage } from "element-plus";
import { onMounted, ref } from "vue";
import {
  createBooking,
  fetchAvailability,
  fetchBookings,
  fetchMembers,
  fetchRooms,
  fetchSettlements,
  rechargeMember,
  settleBooking,
  type CreateBookingPayload,
} from "./api/client";
import { APP_CODE, APP_NAME } from "./constants/app";
import { REQUEST_MESSAGES } from "./constants/messages";
import type { Booking, Member, Room, RoomAvailability, Settlement } from "./types";
import AvailabilityBoard from "./components/AvailabilityBoard.vue";
import BookingForm from "./components/BookingForm.vue";
import BookingsTable from "./components/BookingsTable.vue";
import MemberPanel from "./components/MemberPanel.vue";
import SettlementsTable from "./components/SettlementsTable.vue";

const rooms = ref<Room[]>([]);
const members = ref<Member[]>([]);
const availability = ref<RoomAvailability[]>([]);
const bookings = ref<Booking[]>([]);
const settlements = ref<Settlement[]>([]);
const selectedDate = ref(new Date().toISOString().slice(0, 10));
const loading = ref(false);
const submitting = ref(false);
const settlingId = ref("");
const bookingFormRef = ref<InstanceType<typeof BookingForm> | null>(null);

async function reloadAll() {
  loading.value = true;
  try {
    const [roomList, memberList, availabilityList, bookingList, settlementList] = await Promise.all([
      fetchRooms(),
      fetchMembers(),
      fetchAvailability(selectedDate.value),
      fetchBookings(),
      fetchSettlements(),
    ]);
    rooms.value = roomList;
    members.value = memberList;
    availability.value = availabilityList;
    bookings.value = bookingList;
    settlements.value = settlementList;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : REQUEST_MESSAGES.loadFailed);
  } finally {
    loading.value = false;
  }
}

async function onDateChange(date: string) {
  selectedDate.value = date;
  try {
    availability.value = await fetchAvailability(date);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : REQUEST_MESSAGES.loadFailed);
  }
}

function onPickSlot(roomId: string, startHour: number) {
  bookingFormRef.value?.prefill(roomId, selectedDate.value, startHour);
  ElMessage.info("已填入预约表单，请选择会员后提交。");
}

async function onSubmitBooking(payload: CreateBookingPayload) {
  submitting.value = true;
  try {
    await createBooking({ ...payload, date: payload.date || selectedDate.value });
    ElMessage.success(REQUEST_MESSAGES.bookingCreated);
    await reloadAll();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "预约失败");
    await reloadAll();
  } finally {
    submitting.value = false;
  }
}

async function onSettle(booking: Booking) {
  settlingId.value = booking._id;
  try {
    const result = await settleBooking(booking._id);
    ElMessage.success(result.duplicated ? REQUEST_MESSAGES.settleDuplicated : REQUEST_MESSAGES.settleDone);
    await reloadAll();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "结算失败");
    await reloadAll();
  } finally {
    settlingId.value = "";
  }
}

async function onRecharge(memberId: string, amount: number) {
  try {
    await rechargeMember(memberId, amount);
    ElMessage.success(REQUEST_MESSAGES.rechargeDone);
    await reloadAll();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "充值失败");
  }
}

function goHealth() {
  window.location.href = REQUEST_MESSAGES.healthPath;
}

onMounted(reloadAll);
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div>
        <span class="brand-code">{{ APP_CODE }}</span>
        <h1 class="brand-title">{{ APP_NAME }} · 包厢预约与会员结算</h1>
      </div>
      <div class="topbar-actions">
        <el-button :loading="loading" @click="reloadAll">刷新数据</el-button>
        <el-button type="primary" @click="goHealth">API Health</el-button>
      </div>
    </header>
    <section v-loading="loading" class="workspace">
      <MemberPanel :members="members" @recharge="onRecharge" />
      <AvailabilityBoard
        :availability="availability"
        :date="selectedDate"
        @update:date="onDateChange"
        @pick="onPickSlot"
      />
      <BookingForm
        ref="bookingFormRef"
        :rooms="rooms"
        :members="members"
        :date="selectedDate"
        :submitting="submitting"
        @submit="onSubmitBooking"
      />
      <BookingsTable :bookings="bookings" :settling-id="settlingId" @settle="onSettle" />
      <SettlementsTable :settlements="settlements" />
    </section>
  </main>
</template>
