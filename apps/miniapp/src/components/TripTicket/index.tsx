import { Image, Text, View } from '@tarojs/components';
import { TripStatus } from '@travel-guide/constants';
import type { ClientTrip } from '@travel-guide/api-client';
import './index.scss';

const statusNames: Record<TripStatus, string> = {
  DRAFT: '待规划', PREPARING: '待出发', DEPARTING: '即将出发', TRAVELING: '旅行中', RETURNING: '返程中', COMPLETED: '已完成',
};
const ticketColors = ['green', 'teal', 'purple', 'pink', 'orange'] as const;
const datePart = (value: string | null) => value?.slice(0, 10) ?? '';
const tripPeriod = (trip: ClientTrip) => {
  const start = datePart(trip.startDate);
  const end = datePart(trip.endDate);
  return start && end ? `${start} — ${end}` : start || end || '日期待定';
};
const tripDuration = (trip: ClientTrip) => {
  const start = datePart(trip.startDate);
  const end = datePart(trip.endDate);
  if (!start || !end) return '待定';
  const days = Math.max(1, Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1);
  return `${days}天${Math.max(0, days - 1)}晚`;
};

export interface TripTicketProps {
  trip: ClientTrip;
  sequence: number;
  destination: string;
  destinationCount: number;
  onClick: () => void;
}

export function TripTicket({ trip, sequence, destination, destinationCount, onClick }: TripTicketProps) {
  const color = ticketColors[(sequence - 1) % ticketColors.length];
  return <View className={`trip-ticket accent-${color} ${trip.status === TripStatus.COMPLETED ? 'is-completed' : ''}`}
    onClick={onClick} role="button" aria-label={`查看${trip.title}的旅行目的地`}>
    <View className="trip-ticket-header">
      <View className="trip-ticket-header-main"><Text className="trip-ticket-title">{trip.title}</Text></View>
      <View className="trip-ticket-header-stub"><Text className="trip-ticket-number">BOARDING PASS · {String(sequence).padStart(2, '0')}</Text></View>
    </View>
    <View className="trip-ticket-body">
      <View className="trip-ticket-main">
        <View className="trip-ticket-route">
          <View className="trip-ticket-city"><Text>FROM</Text><Text>CHINA</Text></View>
          <View className="trip-ticket-flight"><Text>··········✈··········</Text></View>
          <View className="trip-ticket-city trip-ticket-city-to"><Text>TO</Text><Text>{destination.toUpperCase()}</Text></View>
        </View>
        <View className="trip-ticket-footer"><View className="trip-ticket-footer-details"><Text>{tripPeriod(trip)}</Text>
          <Text className="trip-ticket-duration">行程时长 · {tripDuration(trip)}</Text></View><Text className="trip-ticket-view-link">查看旅程 ↗</Text></View>
      </View>
      <View className="trip-ticket-stub">
        <Text className="trip-ticket-brand">THE TRIP MUST GO ON</Text>
        <Text className="trip-ticket-role">{trip.memberRole === 'MEMBER' ? '同行旅行' : '我创建的'}</Text>
        <Text className={`trip-ticket-status status-${trip.status.toLowerCase()}`}>{statusNames[trip.status]}</Text>
        <View className="trip-ticket-stat"><Text>目的地</Text><Text>{destinationCount} 站</Text></View>
        {(trip.members?.length ?? 0) > 1 && <View className="trip-ticket-members">{trip.members!.slice(0, 3).map((member) =>
          <View className="trip-ticket-member-avatar" key={member.userId}>{member.avatarUrl ? <Image src={member.avatarUrl} mode="aspectFill" /> :
            <Text>{member.nickname.slice(0, 1)}</Text>}</View>)}{trip.members!.length > 3 && <Text className="trip-ticket-member-more">+{trip.members!.length - 3}</Text>}</View>}
      </View>
    </View>
  </View>;
}
