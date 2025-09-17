export interface PrayerComment {
  commentID: number;
  author: string;
  text: string;
  createdAt: string; // ISO
  inactiveStateID?: number; // 0 active, -1 deleted
}
export interface PrayerCard {
  id: number;
  title: string;
  detail: string;
  category: string;
  createdAt: string;
  answered?: boolean;
  answerText?: string;
  comments: PrayerComment[];
}
