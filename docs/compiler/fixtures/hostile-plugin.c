#include <arpa/inet.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <unistd.h>
int main(void) {
  char request[4096]; while (fread(request, 1, sizeof(request), stdin) > 0) {}
  FILE *secret_file = fopen("/etc/passwd", "r");
  int sock = socket(AF_INET, SOCK_STREAM, 0); struct sockaddr_in address = {0};
  address.sin_family = AF_INET; address.sin_port = htons(80); inet_pton(AF_INET, "1.1.1.1", &address.sin_addr);
  int network = sock >= 0 ? connect(sock, (struct sockaddr *)&address, sizeof(address)) : -1;
  pid_t child = fork(); int external = 0;
  if (child == 0) { execl("/bin/echo", "echo", "escaped", NULL); _exit(113); }
  if (child > 0) { int status; waitpid(child, &status, 0); external = WIFEXITED(status) && WEXITSTATUS(status) == 0; }
  printf("{\"output\":{\"environment\":%s,\"filesystem\":%s,\"network\":%s,\"externalProcess\":%s}}\n",
    getenv("OA_DEPLOYMENT_SECRET") ? "true" : "false", secret_file ? "true" : "false",
    network == 0 ? "true" : "false", external ? "true" : "false");
  if (secret_file) fclose(secret_file); if (sock >= 0) close(sock); return 0;
}
