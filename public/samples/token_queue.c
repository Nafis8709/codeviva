#include <stdio.h>
#include <stdlib.h>
#include "token_queue.h"

void init_queue(TokenQueue *q) {
    q->head = NULL;
    q->tail = NULL;
    q->size = 0;
}

/* Priority customers go after the other priority customers,
   but before everyone else. Returns 0 on success, -1 if out of memory. */
int enqueue(TokenQueue *q, int token, int is_priority) {
    Node *node = malloc(sizeof(Node));
    if (node == NULL) {
        return -1;
    }
    node->token = token;
    node->is_priority = is_priority;
    node->next = NULL;

    if (q->head == NULL) {
        q->head = node;
        q->tail = node;
    } else if (is_priority && !q->head->is_priority) {
        node->next = q->head;
        q->head = node;
    } else if (is_priority) {
        Node *cur = q->head;
        while (cur->next != NULL && cur->next->is_priority) {
            cur = cur->next;
        }
        node->next = cur->next;
        cur->next = node;
        if (node->next == NULL) {
            q->tail = node;
        }
    } else {
        q->tail->next = node;
        q->tail = node;
    }
    q->size++;
    return 0;
}

/* Removes the customer at the front. Returns 0 on success, -1 if empty. */
int dequeue(TokenQueue *q, int *token_out) {
    if (q->head == NULL) {
        return -1;
    }
    Node *old = q->head;
    *token_out = old->token;
    q->head = old->next;
    if (q->head == NULL) {
        q->tail = NULL;
    }
    free(old);
    q->size--;
    return 0;
}

/* Rough waiting time in minutes for someone joining the back of the line. */
int estimate_wait(const TokenQueue *q, int avg_service_seconds) {
    int total_seconds = q->size * avg_service_seconds;
    return total_seconds / 60;
}

void free_queue(TokenQueue *q) {
    Node *cur = q->head;
    while (cur != NULL) {
        Node *next = cur->next;
        free(cur);
        cur = next;
    }
    init_queue(q);
}

int main(void) {
    TokenQueue q;
    init_queue(&q);
    int next_token = 1;
    int choice;

    while (1) {
        printf("1) New customer  2) Priority customer  3) Serve  0) Exit\n> ");
        if (scanf("%d", &choice) != 1) {
            printf("Please enter a number.\n");
            while (getchar() != '\n') { }
            continue;
        }
        if (choice == 0) {
            break;
        } else if (choice == 1 || choice == 2) {
            if (enqueue(&q, next_token, choice == 2) == 0) {
                printf("Token %d issued. Estimated wait: %d min\n",
                       next_token, estimate_wait(&q, 150));
                next_token++;
            }
        } else if (choice == 3) {
            int served;
            if (dequeue(&q, &served) == 0) {
                printf("Now serving token %d\n", served);
            } else {
                printf("No one is waiting.\n");
            }
        }
    }
    free_queue(&q);
    return 0;
}
