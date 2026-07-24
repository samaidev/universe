# Makefile - 虚拟宇宙演化引擎
#
# 用法:
#   make          # 编译
#   make run      # 编译并运行 (默认 256 步)
#   make run N=64 # 编译并运行 64 步
#   make clean    # 清理

CC      = cc
CFLAGS  = -std=c11 -Wall -Wextra -O2 -Iinclude -Iconfig
LDFLAGS = -lm

SRC_DIR = src
OBJ_DIR = build
SOURCES = $(wildcard $(SRC_DIR)/*.c)
OBJECTS = $(patsubst $(SRC_DIR)/%.c,$(OBJ_DIR)/%.o,$(SOURCES))
TARGET  = universe

.PHONY: all run clean

all: $(TARGET)

$(TARGET): $(OBJECTS)
	$(CC) $(OBJECTS) -o $@ $(LDFLAGS)

$(OBJ_DIR)/%.o: $(SRC_DIR)/%.c
	@mkdir -p $(OBJ_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

run: $(TARGET)
	./$(TARGET) $(N)

clean:
	rm -rf $(OBJ_DIR) $(TARGET)
