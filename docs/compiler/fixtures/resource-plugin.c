#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
int main(int argc, char **argv) {
  char request[4096]; while (fread(request, 1, sizeof(request), stdin) > 0) {}
#ifdef INFINITE
  for (;;) {}
#endif
  volatile unsigned char *memory = malloc(128 * 1024 * 1024); if (memory) for (size_t i = 0; i < 128 * 1024 * 1024; i += 4096) memory[i] = 1;
  printf("{\"output\":{\"memoryDenied\":%s}}\n", memory ? "false" : "true"); free((void *)memory); return 0;
}
