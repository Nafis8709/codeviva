#ifndef TOKEN_QUEUE_H
#define TOKEN_QUEUE_H

/* One customer waiting at the bank counter. */
typedef struct Node {
    int token;              /* token number printed on the slip */
    int is_priority;        /* 1 for senior citizens / disabled customers */
    struct Node *next;
} Node;

typedef struct {
    Node *head;             /* next customer to be served */
    Node *tail;             /* last customer in the line */
    int size;
} TokenQueue;

void init_queue(TokenQueue *q);
int  enqueue(TokenQueue *q, int token, int is_priority);
int  dequeue(TokenQueue *q, int *token_out);
int  estimate_wait(const TokenQueue *q, int avg_service_seconds);
void free_queue(TokenQueue *q);

#endif
