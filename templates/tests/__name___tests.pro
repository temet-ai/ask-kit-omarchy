QT += core gui quick quickcontrols2 testlib dbus
CONFIG += c++17 testcase
TARGET = {{name}}_tests
TEMPLATE = app

INCLUDEPATH += ../src

HEADERS += ../src/backend.h ../src/theme.h ../src/translator.h
SOURCES += {{name}}_tests.cpp ../src/backend.cpp ../src/theme.cpp ../src/translator.cpp
