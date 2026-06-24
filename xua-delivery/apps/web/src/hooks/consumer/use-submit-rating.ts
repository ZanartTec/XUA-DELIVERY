"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";

interface SubmitRatingPayload {
  orderId: string;
  rating: number;
  comment?: string;
}

export function useSubmitRating() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, rating, comment }: SubmitRatingPayload) =>
      api.post(`/api/orders/${orderId}/rating`, { rating, comment }),
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    },
  });
}
